import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import { round, setMetric, type BuildContext } from '../context';

const GPO: [number, number] = [144.9631, -37.8136];

export interface Catchments {
  c400: Feature<Polygon | MultiPolygon> | null;
  c800: Feature<Polygon | MultiPolygon> | null;
}

/** Union of walking catchments (straight-line buffers) around every tram stop. */
export function tramCatchments(stops: FeatureCollection<Point>): Catchments {
  const make = (m: number) => {
    const buffers = stops.features.map((s) => turf.circle(s.geometry.coordinates, m / 1000, { steps: 16, units: 'kilometers' }));
    if (!buffers.length) return null;
    // Union in batches to keep polygon clipping fast.
    let acc: Feature<Polygon | MultiPolygon>[] = buffers;
    while (acc.length > 1) {
      const next: Feature<Polygon | MultiPolygon>[] = [];
      for (let i = 0; i < acc.length; i += 16) {
        const batch = acc.slice(i, i + 16);
        const u = batch.length === 1 ? batch[0] : turf.union(turf.featureCollection(batch));
        if (u) next.push(u);
      }
      acc = next;
    }
    return acc[0] ?? null;
  };
  return { c400: make(400), c800: make(800) };
}

function shareWithin(b: Feature<Polygon | MultiPolygon>, c: Feature<Polygon | MultiPolygon> | null): number {
  if (!c) return 0;
  const hit = turf.intersect(turf.featureCollection([b, c]));
  if (!hit) return 0;
  return Math.min(1, turf.area(hit) / turf.area(b));
}

export function applyGeo(ctx: BuildContext, catchments: Catchments): void {
  const asAt = '2026-05-01';
  const t = ctx.transport;
  for (const b of ctx.boundaries) {
    const s = ctx.byCode.get(b.properties.code);
    if (!s) continue;
    const centroid = s.centroid;

    setMetric(s, 'distanceCbd', round(turf.distance(centroid, GPO, { units: 'kilometers' }), 2), 'derived', asAt, undefined, false, ctx.approxGeometry);

    if (!t) continue;

    // Tram
    s.access.tramShare400 = round(shareWithin(b, catchments.c400), 3);
    s.access.tramShare800 = round(shareWithin(b, catchments.c800), 3);
    setMetric(s, 'tramShare800', round(s.access.tramShare800 * 100, 1), 'dtp-transport', asAt, undefined, false, ctx.approxGeometry);
    const routes = new Set<string>();
    for (const l of t.tramLines.features) if (turf.booleanIntersects(b, l)) routes.add(l.properties.route);
    s.access.tramRoutes = [...routes].filter(Boolean).sort((a, z) => Number(a) - Number(z) || a.localeCompare(z));
    let nearestTram = Infinity;
    for (const st of t.tramStops.features) nearestTram = Math.min(nearestTram, turf.distance(centroid, st.geometry.coordinates, { units: 'meters' }));
    s.access.nearestTramStopM = Number.isFinite(nearestTram) ? Math.round(nearestTram) : null;

    // Train
    let best: { name: string; line: string; distanceM: number } | null = null;
    for (const st of t.trainStations.features) {
      const d = turf.distance(centroid, st.geometry.coordinates, { units: 'meters' });
      if (!best || d < best.distanceM) best = { name: st.properties.name, line: st.properties.line, distanceM: Math.round(d) };
    }
    s.access.nearestStation = best;
    if (best) setMetric(s, 'distanceTrain', round(best.distanceM / 1000, 2), 'dtp-transport', asAt, undefined, false, ctx.approxGeometry);
    const lines = new Set<string>();
    const near = turf.buffer(b, 0.3, { units: 'kilometers' });
    for (const l of t.trainLines.features) if (near && turf.booleanIntersects(near, l)) lines.add(l.properties.route);
    s.access.trainLines = [...lines].filter(Boolean).sort();
  }
}

/** Gross yield and price-to-income, from the joined inputs. */
export function applyDerived(ctx: BuildContext): void {
  for (const s of ctx.suburbs) {
    for (const type of ['houses', 'units'] as const) {
      const price = s[type].metrics.medianPrice;
      const rent = s[type].metrics.medianRent;
      const income = s.common.medianIncome;
      const mock = !!(price?.mock || rent?.mock);
      const older = (...d: (string | undefined)[]) => d.filter(Boolean).sort()[0] ?? '';
      if (price?.value && rent?.value) {
        setMetric(s, 'grossYield', round(((rent.value * 52) / price.value) * 100, 2), 'derived', older(price.asAt, rent.asAt), type, mock);
      } else setMetric(s, 'grossYield', null, 'derived', older(price?.asAt, rent?.asAt), type);
      if (price?.value && income?.value) {
        setMetric(s, 'priceToIncome', round(price.value / income.value, 2), 'derived', price.asAt, type, mock || !!income.mock);
      } else setMetric(s, 'priceToIncome', null, 'derived', price?.asAt ?? '', type);
    }
  }
}

export function vicMask(outline: [number, number][]): Feature<Polygon> {
  // World polygon with Victoria cut out, so the rest of Australia can be muted.
  const world: [number, number][] = [[100, -5], [170, -5], [170, -50], [100, -50], [100, -5]];
  return turf.polygon([world, [...outline].reverse()]);
}
