import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, LineString, Point, Polygon, MultiPolygon } from 'geojson';
import type { BoundaryFeature, TransportFeatures } from '../context';
import { findByName, round, setMetric, setSeries } from '../context';
import { SEED, type SeedSuburb } from '../mock/suburbs.seed';
import { BAY_WATER, TRAIN_LINES, TRAM_LINES, type SeedLine } from '../mock/transport.seed';
import type { PropertyType, SeriesPoint, SourceId, Suburb } from '../../../src/lib/types';
import type { Adapter } from './types';
import { salCodes } from './curated';

/* Deterministic RNG per suburb so the mock data is stable between builds. */
function rngFor(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const GPO: [number, number] = [144.9631, -37.8136];

export function mockCode(i: number): string {
  return `2${String(i + 1).padStart(4, '0')}`;
}

/* ------------------------------------------------------------------ */
/* Boundaries: Voronoi cells around seed centroids, trimmed to a       */
/* radius and to the bay coastline.                                     */
/* ------------------------------------------------------------------ */

export const mockBoundaries: Adapter = {
  id: 'mock-boundaries',
  name: 'Approximate suburb boundaries',
  stage: 'boundaries',
  licensed: false,
  available: () => true,
  run(ctx) {
    if (ctx.boundaries.length) return;
    const pts = turf.featureCollection(SEED.map((s, i) => turf.point([s.lng, s.lat], { i })));
    const bbox: [number, number, number, number] = [144.7, -38.0, 145.25, -37.6];
    const cells = turf.voronoi(pts, { bbox });
    const water = turf.polygon([BAY_WATER]);
    const codes = salCodes();
    const out: BoundaryFeature[] = [];
    cells.features.forEach((cell, i) => {
      if (!cell) return;
      const seed = SEED[i];
      const circle = turf.circle([seed.lng, seed.lat], 1.9, { steps: 48, units: 'kilometers' });
      let shape: Feature<Polygon | MultiPolygon> | null = turf.intersect(turf.featureCollection([cell as Feature<Polygon>, circle]));
      if (shape) shape = turf.difference(turf.featureCollection([shape, water]));
      if (!shape) return;
      out.push({
        type: 'Feature',
        geometry: roundGeom(shape.geometry),
        properties: { code: codes.get(seed.name) ?? mockCode(i), name: seed.name, lga: seed.lga, postcode: seed.postcode },
      });
    });
    ctx.boundaries = out;
    ctx.approxGeometry = true;
    ctx.log(`  ${out.length} mock boundaries`);
  },
};

function roundGeom<T extends Polygon | MultiPolygon>(g: T): T {
  const r = (c: number[]) => [round(c[0], 5), round(c[1], 5)];
  if (g.type === 'Polygon') return { ...g, coordinates: g.coordinates.map((ring) => ring.map(r)) };
  return { ...g, coordinates: (g as MultiPolygon).coordinates.map((p) => p.map((ring) => ring.map(r))) } as T;
}

/* ------------------------------------------------------------------ */
/* Transport: approximate tram and train alignments.                    */
/* ------------------------------------------------------------------ */

export const mockTransport: Adapter = {
  id: 'mock-transport',
  name: 'Approximate tram and train network',
  stage: 'transport',
  licensed: false,
  available: () => true,
  run(ctx) {
    if (ctx.transport) return;
    const toLines = (lines: SeedLine[]) =>
      turf.featureCollection(lines.map((l) => turf.lineString(l.coords, { route: l.route, name: l.name }))) as FeatureCollection<LineString, { route: string; name: string }>;

    const tramLines = toLines(TRAM_LINES);
    const trainLines = toLines(TRAIN_LINES);

    // Tram stops every ~330 m, merged where routes share a street.
    const tramStops = interpolateStops(tramLines, 0.33, 0.12, (route) => ({ name: '', routes: route }));
    const nameStop = (p: Feature<Point>) => nearestSeed(p.geometry.coordinates as [number, number]).name;
    tramStops.features.forEach((f, i) => (f.properties.name = `${nameStop(f)} stop ${i + 1}`));

    const trainStations = interpolateStops(trainLines, 1.3, 0.45, (route) => ({ name: '', line: route }));
    const used = new Map<string, number>();
    trainStations.features.forEach((f) => {
      const base = nameStop(f);
      const n = (used.get(base) ?? 0) + 1;
      used.set(base, n);
      f.properties.name = n === 1 ? base : `${base} ${n}`;
    });

    ctx.transport = { tramLines, tramStops, trainLines, trainStations } as TransportFeatures;
    ctx.approxGeometry = true;
    ctx.log(`  ${tramLines.features.length} tram routes, ${tramStops.features.length} stops; ${trainLines.features.length} train lines, ${trainStations.features.length} stations`);
  },
};

function interpolateStops<P extends Record<string, string>>(
  lines: FeatureCollection<LineString, { route: string; name: string }>,
  spacingKm: number,
  mergeKm: number,
  props: (route: string) => P,
): FeatureCollection<Point, P> {
  const stops: Feature<Point, P>[] = [];
  for (const line of lines.features) {
    const len = turf.length(line, { units: 'kilometers' });
    for (let d = 0; d <= len + 1e-6; d += spacingKm) {
      const p = turf.along(line, Math.min(d, len), { units: 'kilometers' });
      const c = p.geometry.coordinates as [number, number];
      const near = stops.find((s) => turf.distance(s.geometry.coordinates, c, { units: 'kilometers' }) < mergeKm);
      if (near) {
        const key = 'routes' in near.properties ? 'routes' : 'line';
        const list = new Set(String(near.properties[key]).split(','));
        list.add(line.properties.route);
        (near.properties as Record<string, string>)[key] = [...list].join(',');
        continue;
      }
      stops.push(turf.point([round(c[0], 5), round(c[1], 5)], props(line.properties.route)) as Feature<Point, P>);
    }
  }
  return turf.featureCollection(stops);
}

function nearestSeed(c: [number, number]): SeedSuburb {
  let best = SEED[0];
  let bestD = Infinity;
  for (const s of SEED) {
    const d = (s.lng - c[0]) ** 2 + (s.lat - c[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Metrics                                                              */
/* ------------------------------------------------------------------ */

/** "As at" dates per source for the mock dataset. Homes Victoria is deliberately stale. */
export const MOCK_AS_AT: Partial<Record<SourceId, string>> = {
  vgv: '2026-06-30',
  homesvic: '2026-03-31',
  'abs-census': '2021-08-10',
  'abs-seifa': '2021-08-10',
  'abs-approvals': '2026-08-31',
  'abs-population': '2025-06-30',
  'vicmap-planning': '2026-07-01',
  sqm: '2026-09-30',
  cotality: '2026-09-30',
  domain: '2026-10-10',
};

export const mockMetrics: Adapter = {
  id: 'mock-metrics',
  name: 'Mock seed metrics',
  stage: 'metrics',
  licensed: false,
  available: (ctx) => (ctx.args.has('--no-mock') ? 'disabled with --no-mock' : true),
  run(ctx) {
    let n = 0;
    for (const seed of SEED) {
      const s = findByName(ctx, seed.name);
      if (!s) continue;
      seedSuburb(s, seed);
      n++;
    }
    ctx.usedMock = true;
    ctx.log(`  seeded ${n} suburbs`);
  },
};

function seedSuburb(s: Suburb, seed: SeedSuburb): void {
  const rnd = rngFor(seed.name);
  const noise = (amp: number) => (rnd() * 2 - 1) * amp;
  const at = (src: SourceId) => MOCK_AS_AT[src] ?? '2026-06-30';
  const put = (key: string, v: number | null, src: SourceId, type?: PropertyType) => setMetric(s, key, v, src, at(src), type, true);

  const dist = turf.distance([seed.lng, seed.lat], GPO, { units: 'kilometers' });
  const d = seed.density;

  if (!s.postcode) s.postcode = seed.postcode;
  if (!s.lga) s.lga = seed.lga;

  // Census-style shares
  s.renterShare = clamp(0.24 + d * 0.12 + noise(0.06) + (seed.name === 'Carlton' ? 0.12 : 0), 0.15, 0.8);
  s.unitShare = clamp(0.1 + d * 0.22 + noise(0.06), 0.04, 0.95);
  s.overlays = { flood: !!seed.flood, bushfire: !!seed.bushfire, heritage: !!seed.heritage };

  const dwellings = Math.round(3000 + rnd() * 7000 + d * 3500);
  const incomeAnnual = 70000 + seed.seifa * 13000 + noise(8000);
  put('dwellings', dwellings, 'abs-census');
  put('medianIncome', round(incomeAnnual, 0), 'abs-census');
  put('ownerOccupier', round((1 - s.renterShare) * 100, 1), 'abs-census');
  put('seifa', seed.seifa, 'abs-seifa');
  put('popGrowth', round(0.5 + d * 0.5 + noise(0.5), 2), 'abs-population');

  const approvalsRatio = clamp(0.35 + d * 0.75 + noise(0.4) + (seed.name === 'Box Hill' ? 0.8 : 0), 0.1, 5);
  put('approvalsRatio', round(approvalsRatio, 2), 'abs-approvals');
  put('buildingApprovals', Math.round((approvalsRatio / 100) * dwellings), 'abs-approvals');
  put('vacancy', round(clamp(1.4 + d * 0.4 + noise(0.6), 0.6, 4.2), 2), 'sqm');

  // Planning zones
  const nrz = clamp([0.72, 0.5, 0.28, 0.05][d] + noise(0.1), 0, 0.9);
  const rgz = clamp([0.03, 0.08, 0.18, 0.35][d] + noise(0.04), 0, 0.6);
  const grz = clamp(1 - nrz - rgz - 0.12, 0, 1);
  s.zones = { NRZ: round(nrz, 3), GRZ: round(grz, 3), RGZ: round(rgz, 3), other: round(Math.max(0, 1 - nrz - grz - rgz), 3) };
  put('nrzShare', round(nrz * 100, 1), 'vicmap-planning');

  for (const type of ['houses', 'units'] as const) {
    const price = type === 'houses' ? seed.house : seed.unit;
    if (price == null) {
      // Not enough house sales: leave most fields empty so the UI shows "not enough data".
      put('medianPrice', null, 'vgv', type);
      continue;
    }
    const P = price * 1000 * (1 + noise(0.03));
    const yieldPct =
      type === 'houses'
        ? clamp(3.0 - 0.9 * Math.log2(price / 1400) + noise(0.25), 1.8, 4.6)
        : clamp(4.6 - 1.5 * Math.log2(price / 550) + d * 0.12 + noise(0.3), 3.2, 6.2);
    const rent = Math.round((P * yieldPct) / 100 / 52 / 5) * 5;

    put('medianPrice', Math.round(P / 1000) * 1000, 'vgv', type);
    put('medianRent', rent, 'homesvic', type);

    const unitAdj = type === 'units' ? 1 : 0;
    put('stockOnMarket', round(clamp(0.85 + noise(0.45) + d * 0.1 + unitAdj * (0.25 + d * 0.3), 0.3, 3), 2), 'sqm', type);
    put('supplyTrend', round(noise(16) + unitAdj * d * 4, 1), 'sqm', type);
    put('inventoryMonths', round(clamp(2.4 + noise(1.3) + d * 0.3 + unitAdj * (0.8 + d * 0.7), 1, 9), 1), 'cotality', type);
    put('dom', Math.round(clamp(22 + dist * 0.7 + noise(10) + unitAdj * (8 + d * 6), 12, 110)), 'cotality', type);
    put('domTrend', round(noise(9) + unitAdj * d * 1.5, 1), 'cotality', type);
    const clearance = clamp(70 - dist * 0.3 + noise(8) + (seed.seifa - 7) * 1.2 - unitAdj * (8 + d * 3), 40, 88);
    put('clearance', type === 'units' && rnd() < 0.12 ? null : round(clearance, 1), 'domain', type);
    put('vendorDiscount', round(clamp(3 + noise(1.4) + unitAdj * (0.6 + d * 0.5), 0.8, 8), 1), 'cotality', type);

    const g10 = type === 'houses' ? 48 + noise(22) - d * 4 : 14 + noise(12) - d * 6;
    const g5 = type === 'houses' ? 9 + noise(10) - d * 1.5 : -1 + noise(8) - d * 3;
    const g3 = type === 'houses' ? 1.5 + noise(8) : 0.5 + noise(6) - d;
    const g1 = type === 'houses' ? 3 + noise(4) : 2 + noise(3);
    put('growth10y', round(g10, 1), 'vgv', type);
    put('growth5y', round(g5, 1), 'vgv', type);
    put('growth3y', round(g3, 1), 'vgv', type);
    put('growth1y', round(g1, 1), 'vgv', type);
    const rg1 = 6 + noise(3) + unitAdj;
    const rg3 = 24 + noise(8) + unitAdj * 3;
    put('rentGrowth1y', round(rg1, 1), 'homesvic', type);
    put('rentGrowth3y', round(rg3, 1), 'homesvic', type);
    if (type === 'houses') {
      put('landToAsset', round(clamp(0.52 + (price / 1000) * 0.05 + noise(0.06) + (seed.heritage ? 0.04 : 0), 0.4, 0.9) * 100, 1), 'vgv', type);
    }

    // Five-year quarterly series
    const vac = s.common.vacancy?.value ?? 2;
    const dom = s[type].metrics.dom?.value ?? 30;
    setSeries(s, type, 'price', walk(rnd, P / (1 + g5 / 100), P, 0.015, (v) => Math.round(v / 1000) * 1000));
    setSeries(s, type, 'rent', walk(rnd, rent / Math.pow(1 + rg3 / 100, 5 / 3), rent, 0.01, (v) => Math.round(v / 5) * 5));
    setSeries(s, type, 'vacancy', walk(rnd, clamp(vac + 1.2 + noise(0.8), 0.6, 5), vac, 0.08, (v) => round(Math.max(0.3, v), 2)));
    setSeries(s, type, 'dom', walk(rnd, clamp(dom + noise(15), 10, 120), dom, 0.08, (v) => Math.round(Math.max(8, v))));
  }
}

/** Quarterly random walk from `start` to `end` over five years ending Sep 2026. */
function walk(rnd: () => number, start: number, end: number, vol: number, fmt: (v: number) => number): SeriesPoint[] {
  const n = 21;
  const pts: SeriesPoint[] = [];
  let drift = 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    drift += (rnd() * 2 - 1) * vol;
    const bridge = drift * (1 - t) * Math.min(1, t * 4);
    const v = (start + (end - start) * t) * (1 + bridge);
    const date = new Date(Date.UTC(2021, 8 + i * 3 + 1, 0)); // quarter ends from Sep 2021
    pts.push({ t: date.toISOString().slice(0, 10), v: fmt(i === n - 1 ? end : v) });
  }
  return pts;
}
