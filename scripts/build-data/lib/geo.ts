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
  estimateMissingRents(ctx);
  for (const s of ctx.suburbs) {
    for (const type of ['houses', 'units'] as const) {
      const price = s[type].metrics.medianPrice;
      const rent = s[type].metrics.medianRent;
      const income = s.common.medianIncome;
      const mock = !!(price?.mock || rent?.mock);
      const older = (...d: (string | undefined)[]) => d.filter(Boolean).sort()[0] ?? '';
      if (price?.value && rent?.value) {
        setMetric(s, 'grossYield', round(((rent.value * 52) / price.value) * 100, 2), 'derived', older(price.asAt, rent.asAt), type, mock, !!rent.approx);
      } else setMetric(s, 'grossYield', null, 'derived', older(price?.asAt, rent?.asAt), type);
      if (price?.value && income?.value) {
        setMetric(s, 'priceToIncome', round(price.value / income.value, 2), 'derived', price.asAt, type, mock || !!income.mock);
      } else setMetric(s, 'priceToIncome', null, 'derived', price?.asAt ?? '', type);
    }
    // Turnover: annualised sales of houses and units in the latest quarter, over all dwellings.
    const sales = (['houses', 'units'] as const).map((t) => s[t].metrics.salesQuarter?.value).filter((v): v is number => v != null);
    const dw = s.common.dwellings?.value;
    if (sales.length && dw && dw > 100) {
      setMetric(s, 'turnover', round(((sales.reduce((x, y) => x + y, 0) * 4) / dw) * 100, 2), 'vgv', s.houses.metrics.salesQuarter?.asAt ?? s.units.metrics.salesQuarter?.asAt ?? '');
    }
  }
  for (const type of ['houses', 'units'] as const) {
    valueGap(ctx, type);
    neighbourGap(ctx, type);
  }
}

/**
 * Homes Victoria reports rents only for suburb groups with enough new leases.
 * Elsewhere, estimate rent from the Census median rent, scaled by the typical
 * ratio of today's Homes Victoria rent to Census rent in suburbs that have both.
 */
function estimateMissingRents(ctx: BuildContext): void {
  for (const type of ['houses', 'units'] as const) {
    // Census rent mixes houses and flats, so its ratio to today's house (or unit) rent
    // depends on the apartment share: fit ratio = a + b × apartment share.
    const fit = ctx.suburbs
      .map((s) => {
        const r = s[type].metrics.medianRent;
        const c = s.common.censusRent?.value;
        return r?.value && !r.approx && c && s.unitShare != null ? { x: [1, s.unitShare], y: r.value / c } : null;
      })
      .filter((v): v is { x: number[]; y: number } => v != null);
    if (fit.length < 30) continue;
    const beta = ols(fit.map((f) => f.x), fit.map((f) => f.y));
    if (!beta) continue;
    const asAt = ctx.suburbs.map((s) => s[type].metrics.medianRent?.asAt).filter(Boolean).sort().pop() ?? '';
    let n = 0;
    for (const s of ctx.suburbs) {
      if (s[type].metrics.medianRent?.value || !s[type].metrics.medianPrice?.value) continue;
      const c = s.common.censusRent?.value;
      if (!c || s.unitShare == null) continue;
      const ratio = beta[0] + beta[1] * s.unitShare;
      setMetric(s, 'medianRent', Math.round((c * ratio) / 5) * 5, 'abs-census', asAt, type, false, true);
      n++;
    }
    const err = fit.map((f) => Math.abs((beta[0] + beta[1] * f.x[1]) / f.y - 1)).sort((x, y) => x - y);
    ctx.log(`  ${type}: estimated rent for ${n} suburbs from the Census (ratio ${beta[0].toFixed(2)} + ${beta[1].toFixed(2)} × apartment share; typical error ${(err[err.length >> 1] * 100).toFixed(0)}%)`);
  }
}

/**
 * Price against fundamentals: the residual of a log-linear regression of median
 * price on household income, SEIFA, distance to the CBD and to a train station
 * the share of apartments and flood and bushfire overlays,
 * fitted across all suburbs. +10 means 10% dearer than the model expects.
 */
function valueGap(ctx: BuildContext, type: 'houses' | 'units'): void {
  const rows: { s: (typeof ctx.suburbs)[number]; x: number[]; y: number }[] = [];
  for (const s of ctx.suburbs) {
    const p = s[type].metrics.medianPrice?.value;
    const inc = s.common.medianIncome?.value;
    const seifa = s.common.seifa?.value;
    const cbd = s.common.distanceCbd?.value;
    const train = s.common.distanceTrain?.value;
    const flats = s.unitShare;
    if (!p || !inc || seifa == null || cbd == null || train == null || flats == null) continue;
    // Apartment share separates apartment-dominated unit markets from townhouse and villa markets;
    // hazard overlays are a fundamental too (insurance, building costs, risk).
    const flood = s.overlays?.flood ? 1 : 0;
    const fire = s.overlays?.bushfire ? 1 : 0;
    rows.push({ s, x: [1, Math.log(inc), seifa, Math.log(cbd + 1), Math.log(train + 0.5), flats, flood, fire], y: Math.log(p) });
  }
  if (rows.length < 40) return;
  const beta = ols(rows.map((r) => r.x), rows.map((r) => r.y));
  if (!beta) return;
  let ss = 0;
  let st = 0;
  const my = rows.reduce((a, r) => a + r.y, 0) / rows.length;
  for (const r of rows) {
    const fit = r.x.reduce((a, v, i) => a + v * beta[i], 0);
    ss += (r.y - fit) ** 2;
    st += (r.y - my) ** 2;
    setMetric(r.s, 'valueGap', round((Math.exp(r.y - fit) - 1) * 100, 1), 'derived', r.s[type].metrics.medianPrice!.asAt, type);
  }
  ctx.log(`  ${type}: value model fitted on ${rows.length} suburbs, R² ${(1 - ss / st).toFixed(2)}`);
}

/** Discount to the median price of suburbs within 4 km (widening to 6 km if fewer than 3). */
function neighbourGap(ctx: BuildContext, type: 'houses' | 'units'): void {
  const priced = ctx.suburbs.filter((s) => s[type].metrics.medianPrice?.value);
  for (const s of priced) {
    const own = s[type].metrics.medianPrice!.value!;
    const dist = priced.filter((o) => o !== s).map((o) => ({ o, d: turf.distance(s.centroid, o.centroid, { units: 'kilometers' }) }));
    let near = dist.filter((x) => x.d <= 4);
    if (near.length < 3) near = dist.filter((x) => x.d <= 6);
    if (near.length < 3) continue;
    const m = median(near.map((x) => x.o[type].metrics.medianPrice!.value!))!;
    setMetric(s, 'neighbourGap', round((m / own - 1) * 100, 1), 'derived', s[type].metrics.medianPrice!.asAt, type);
  }
}

/** Metrics computed from sale prices, whose noise grows as sales volume falls. */
const PRICE_BASED = ['growth1y', 'growth3y', 'growth5y', 'growth10y', 'valueGap', 'neighbourGap'];
/** Quarterly sales at which a suburb's own figure and the metro median get equal weight. */
const SHRINK_SALES = 8;

/**
 * Values to rank price-based metrics on: each suburb's figure pulled toward the
 * metro median by n / (n + k), where n is its quarterly sales (empirical-Bayes
 * shrinkage). Suburbs with few sales can't top or bottom the rankings on noise
 * alone; the displayed figures are unchanged.
 */
export function rankValues(ctx: BuildContext): (s: BuildContext['suburbs'][number], type: 'houses' | 'units', key: string, v: number) => number {
  const centre = new Map<string, number>();
  for (const type of ['houses', 'units'] as const)
    for (const k of PRICE_BASED) {
      const m = median(ctx.suburbs.map((s) => s[type].metrics[k]?.value).filter((v): v is number => v != null));
      if (m != null) centre.set(`${type}:${k}`, m);
    }
  return (s, type, key, v) => {
    const c = centre.get(`${type}:${key}`);
    if (c == null) return v;
    const n = s[type].metrics.salesQuarter?.value;
    if (n == null) return v;
    return c + (v - c) * (n / (n + SHRINK_SALES));
  };
}

function median(v: number[]): number | null {
  if (!v.length) return null;
  const a = [...v].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Ordinary least squares via the normal equations (small, well-conditioned problems only). */
export function ols(X: number[][], y: number[]): number[] | null {
  const k = X[0].length;
  const A = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  for (let r = 0; r < X.length; r++) {
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) A[i][j] += X[r][i] * X[r][j];
      A[i][k] += X[r][i] * y[r];
    }
  }
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let j = c; j <= k; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((row, i) => row[k] / A[i][i]);
}

export function vicMask(outline: [number, number][]): Feature<Polygon> {
  // World polygon with Victoria cut out, so the rest of Australia can be muted.
  const world: [number, number][] = [[100, -5], [170, -5], [170, -50], [100, -50], [100, -5]];
  return turf.polygon([world, [...outline].reverse()]);
}
