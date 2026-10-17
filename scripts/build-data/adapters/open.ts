/**
 * Adapters for the free sources. Each reads a normalised file written by
 * `npm run fetch` into data/sources/ (or the same file placed in data/raw/ by
 * hand) and switches on automatically when that file exists. Later adapters
 * overwrite earlier ones, so these replace the hand-collected snapshot.
 */
import * as turf from '@turf/turf';
import type { FeatureCollection, LineString, MultiLineString, MultiPolygon, Point, Polygon } from 'geojson';
import type { BoundaryFeature, BuildContext } from '../context';
import { num, rawExists, readCsv, readJson, round, setMetric, setSeries } from '../context';
import type { PropertyType, SeriesPoint, Suburb } from '../../../src/lib/types';
import type { Adapter } from './types';

const files = (...names: string[]) => () => {
  const missing = names.filter((f) => !rawExists(f));
  return missing.length ? `no ${missing.join(', ')} (run npm run fetch)` : (true as const);
};

/** Upper-case key matching scripts/fetch/lib/common.ts suburbKey. */
function key(name: string): string {
  let n = name
    .toUpperCase()
    .replace(/\(VIC\.?\)/g, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\bSAINT\b/g, 'ST')
    .replace(/\bMOUNT\b/g, 'MT')
    .replace(/\s+/g, ' ')
    .trim();
  const m = n.match(/^(NORTH|SOUTH|EAST|WEST) (.+)$/);
  if (m && !['MELBOURNE', 'YARRA', 'WHARF', 'KINGSVILLE'].includes(m[2])) n = `${m[2]} ${m[1]}`;
  return n;
}

function byKey(ctx: BuildContext): Map<string, Suburb> {
  return new Map(ctx.suburbs.map((s) => [key(s.name), s]));
}

const pctChange = (now: number | null, then: number | null) => (now != null && then ? ((now - then) / then) * 100 : null);

/* ------------------------------------------------------------------ */
/* Boundaries and transport                                              */
/* ------------------------------------------------------------------ */

export const absSal: Adapter = {
  id: 'abs-sal',
  name: 'ABS SAL 2021 suburb boundaries',
  stage: 'boundaries',
  licensed: false,
  available: files('sal-metro.geojson'),
  run(ctx) {
    const fc = readJson<FeatureCollection<Polygon | MultiPolygon, { code: string; name: string }>>('sal-metro.geojson');
    ctx.boundaries = fc.features.filter((f) => f.geometry) as BoundaryFeature[];
    ctx.log(`  ${ctx.boundaries.length} suburb boundaries`);
  },
};

export const dtpTransport: Adapter = {
  id: 'dtp-transport',
  name: 'PTV GTFS tram and train network',
  stage: 'transport',
  licensed: false,
  available: files('transport-lines.geojson', 'transport-stops.geojson'),
  run(ctx) {
    const lines = readJson<FeatureCollection<LineString | MultiLineString, Record<string, string>>>('transport-lines.geojson');
    const stops = readJson<FeatureCollection<Point, Record<string, string>>>('transport-stops.geojson');
    const toLine = (f: (typeof lines.features)[number]) => ({ ...f, properties: { route: f.properties.SHORT_NAME || f.properties.LONG_NAME, name: f.properties.LONG_NAME } });
    const tramLines = turf.featureCollection(lines.features.filter((f) => f.properties.MODE === 'METRO TRAM').map(toLine));
    const trainLines = turf.featureCollection(lines.features.filter((f) => f.properties.MODE === 'METRO TRAIN').map(toLine));
    const tramStops = turf.featureCollection(stops.features.filter((f) => f.properties.MODE === 'METRO TRAM').map((f) => turf.point(f.geometry.coordinates, { name: f.properties.STOP_NAME, routes: f.properties.ROUTEUSSP })));
    const trainStations = turf.featureCollection(
      stops.features
        .filter((f) => f.properties.MODE === 'METRO TRAIN')
        .map((f) => turf.point(f.geometry.coordinates, { name: f.properties.STOP_NAME.replace(/ (Railway )?Station.*$/i, ''), line: f.properties.ROUTEUSSP })),
    );
    ctx.transport = { tramLines, tramStops, trainLines, trainStations } as BuildContext['transport'];
    ctx.log(`  ${tramLines.features.length} tram shapes, ${tramStops.features.length} tram stops, ${trainStations.features.length} stations`);
  },
};

/* ------------------------------------------------------------------ */
/* Valuer-General prices                                                 */
/* ------------------------------------------------------------------ */

/** Quarterly medians from fewer sales than this are left out. */
const MIN_QUARTER_SALES = 5;

export const vgvMedians: Adapter = {
  id: 'vgv',
  name: 'Valuer-General Victoria median prices',
  stage: 'metrics',
  licensed: false,
  available: files('vgv-medians.csv'),
  run(ctx) {
    const idx = byKey(ctx);
    const series = rawExists('vgv-series.json') ? readJson<Record<string, Partial<Record<PropertyType, SeriesPoint[]>>>>('vgv-series.json') : {};
    let n = 0;
    for (const r of readCsv('vgv-medians.csv')) {
      const s = idx.get(r.key || key(r.suburb));
      const type = r.type as PropertyType;
      if (!s || (type !== 'houses' && type !== 'units')) continue;
      const sales = num(r.sales);
      if (sales != null && sales < MIN_QUARTER_SALES) continue;
      const asAt = r.period_end;
      const put = (k: string, v: number | null, at = asAt) => setMetric(s, k, v, 'vgv', at, type);
      put('medianPrice', num(r.median));
      put('salesQuarter', sales);
      const last = num(r.median_last_year);
      const yearEnd = r.series_last_year ? `${r.series_last_year}-12-31` : asAt;
      // 1-year growth: same quarter a year earlier if the quarterly sheet has it, else the yearly series.
      const qYearAgo = num(r.median_quarter_year_ago);
      if (qYearAgo) put('growth1y', pctChange(num(r.median), qYearAgo));
      else put('growth1y', pctChange(last, num(r.median_1y_ago)), yearEnd);
      put('growth3y', pctChange(last, num(r.median_3y_ago)), yearEnd);
      put('growth5y', pctChange(last, num(r.median_5y_ago)), yearEnd);
      put('growth10y', pctChange(last, num(r.median_10y_ago)), yearEnd);
      const pts = series[r.key]?.[type];
      if (pts?.length) {
        setSeries(s, type, 'price', pts.slice(-6));
        put('volatility', volatility(pts.slice(-11)), pts[pts.length - 1].t);
      }
      n++;
    }
    ctx.log(`  ${n} suburb rows joined`);
  },
};

/** Standard deviation of year-on-year % changes, from at least 5 changes. */
function volatility(pts: SeriesPoint[]): number | null {
  const ch: number[] = [];
  for (let i = 1; i < pts.length; i++) if (pts[i - 1].v > 0) ch.push(((pts[i].v - pts[i - 1].v) / pts[i - 1].v) * 100);
  if (ch.length < 5) return null;
  const mean = ch.reduce((a, b) => a + b, 0) / ch.length;
  return round(Math.sqrt(ch.reduce((a, b) => a + (b - mean) ** 2, 0) / (ch.length - 1)), 2);
}

/* ------------------------------------------------------------------ */
/* Homes Victoria rents                                                  */
/* ------------------------------------------------------------------ */

export const homesVicRents: Adapter = {
  id: 'homesvic',
  name: 'Homes Victoria Rental Report',
  stage: 'metrics',
  licensed: false,
  available: files('homesvic-rents.csv'),
  run(ctx) {
    const idx = byKey(ctx);
    const series = rawExists('homesvic-series.json') ? readJson<Record<string, Partial<Record<PropertyType, SeriesPoint[]>>>>('homesvic-series.json') : {};
    let n = 0;
    const rows = readCsv('homesvic-rents.csv');
    const house2 = new Map(rows.filter((r) => r.type === 'house2').map((r) => [r.key, num(r.median_rent)]));
    let blended = 0;
    for (const r of rows) {
      const s = idx.get(r.key || key(r.suburb));
      const type = r.type as PropertyType;
      if (!s || (type !== 'houses' && type !== 'units')) continue;
      let rent = num(r.median_rent);
      // Unit medians include townhouses; blend the 2-bed flat rent with the 2-bed house
      // rent in proportion to the suburb's townhouse share of units.
      const h2 = type === 'units' ? house2.get(r.key) : null;
      const m = s.dwellingMix;
      if (rent != null && h2 && m) {
        const units = m.semi + m.lowrise + m.midrise + m.highrise;
        const t = units > 0 ? m.semi / units : 0;
        rent = Math.round(rent * (1 - t) + h2 * t);
        blended++;
      }
      setMetric(s, 'medianRent', rent, 'homesvic', r.as_at, type);
      setMetric(s, 'rentGrowth1y', pctChange(rent, num(r.median_rent_1y_ago)), 'homesvic', r.as_at, type);
      setMetric(s, 'rentGrowth3y', pctChange(rent, num(r.median_rent_3y_ago)), 'homesvic', r.as_at, type);
      const pts = series[r.key]?.[type];
      if (pts?.length) setSeries(s, type, 'rent', pts);
      n++;
    }
    ctx.log(`  ${n} suburb rows joined${blended ? `, ${blended} unit rents blended with 2-bed house rents by townhouse share` : ''}`);
  },
};

/* ------------------------------------------------------------------ */
/* ABS: Census, SEIFA, approvals, population                             */
/* ------------------------------------------------------------------ */

export const absCensus: Adapter = {
  id: 'abs-census',
  name: 'ABS Census by suburb (DataPack)',
  stage: 'metrics',
  licensed: false,
  available: files('census-sal.csv'),
  run(ctx) {
    let n = 0;
    for (const r of readCsv('census-sal.csv')) {
      const s = ctx.byCode.get(r.SAL_CODE_2021);
      if (!s) continue;
      const asAt = r.as_at || '2021-08-10';
      const owner = num(r.owner_occupier_share);
      if (owner != null) setMetric(s, 'ownerOccupier', round(owner * 100, 1), 'abs-census', asAt);
      const renter = num(r.renter_share);
      if (renter != null) s.renterShare = renter;
      const units = num(r.unit_share);
      if (units != null) s.unitShare = units;
      const semi = num(r.semi_share);
      const high = num(r.flat_highrise_share);
      if (semi != null && high != null) s.dwellingMix = { semi, lowrise: num(r.flat_lowrise_share) ?? 0, midrise: num(r.flat_midrise_share) ?? 0, highrise: high };
      const rentWeekly = num(r.median_rent_weekly);
      if (rentWeekly) setMetric(s, 'censusRent', rentWeekly, 'abs-census', asAt);
      const weekly = num(r.median_household_income_weekly);
      if (weekly != null) setMetric(s, 'medianIncome', weekly * 52, 'abs-census', asAt);
      const dw = num(r.dwellings);
      if (dw != null) setMetric(s, 'dwellings', dw, 'abs-census', asAt);
      n++;
    }
    ctx.log(`  ${n} suburbs joined`);
  },
};

export const absSeifa: Adapter = {
  id: 'abs-seifa',
  name: 'ABS SEIFA 2021 by suburb',
  stage: 'metrics',
  licensed: false,
  available: files('seifa-sal.csv'),
  run(ctx) {
    let n = 0;
    for (const r of readCsv('seifa-sal.csv')) {
      const s = ctx.byCode.get(r.SAL_CODE_2021);
      if (!s) continue;
      setMetric(s, 'seifa', num(r.irsad_state_decile), 'abs-seifa', r.as_at || '2021-08-10');
      n++;
    }
    ctx.log(`  ${n} suburbs joined`);
  },
};

export const absApprovals: Adapter = {
  id: 'abs-approvals',
  name: 'ABS Building Approvals',
  stage: 'metrics',
  licensed: false,
  available: files('approvals-sal.csv'),
  run(ctx) {
    let n = 0;
    for (const r of readCsv('approvals-sal.csv')) {
      const s = ctx.byCode.get(r.SAL_CODE_2021);
      if (!s) continue;
      const approvals = num(r.approvals_12m);
      setMetric(s, 'buildingApprovals', approvals, 'abs-approvals', r.as_at);
      const dwellings = s.common.dwellings?.value;
      if (approvals != null && dwellings) setMetric(s, 'approvalsRatio', (approvals / dwellings) * 100, 'abs-approvals', r.as_at);
      n++;
    }
    ctx.log(`  ${n} suburbs joined`);
  },
};

export const absPopulation: Adapter = {
  id: 'abs-population',
  name: 'ABS Regional Population',
  stage: 'metrics',
  licensed: false,
  available: files('population-sal.csv'),
  run(ctx) {
    let n = 0;
    for (const r of readCsv('population-sal.csv')) {
      const s = ctx.byCode.get(r.SAL_CODE_2021);
      if (!s) continue;
      setMetric(s, 'popGrowth', num(r.pop_growth_pct), 'abs-population', r.as_at);
      n++;
    }
    ctx.log(`  ${n} suburbs joined`);
  },
};

/* ------------------------------------------------------------------ */
/* Vicmap Planning                                                       */
/* ------------------------------------------------------------------ */

export const vicmapPlanning: Adapter = {
  id: 'vicmap-planning',
  name: 'Vicmap Planning zones and overlays',
  stage: 'metrics',
  licensed: false,
  available: files('planning-sal.csv'),
  run(ctx) {
    let n = 0;
    for (const r of readCsv('planning-sal.csv')) {
      const s = ctx.byCode.get(r.SAL_CODE_2021);
      if (!s) continue;
      const nrz = num(r.nrz) ?? 0;
      const grz = num(r.grz) ?? 0;
      const rgz = num(r.rgz) ?? 0;
      s.zones = { NRZ: nrz, GRZ: grz, RGZ: rgz, other: Math.max(0, 1 - nrz - grz - rgz) };
      const share = num(r.nrz_share_of_residential);
      if (share != null) setMetric(s, 'nrzShare', share * 100, 'vicmap-planning', r.as_at || new Date().toISOString().slice(0, 10));
      s.overlays = { flood: r.flood === '1', bushfire: r.bushfire === '1', heritage: r.heritage === '1' };
      setMetric(s, 'hazard', (s.overlays.flood ? 1 : 0) + (s.overlays.bushfire ? 1 : 0), 'vicmap-planning', r.as_at || new Date().toISOString().slice(0, 10));
      n++;
    }
    ctx.log(`  ${n} suburbs joined`);
  },
};

export function suburbsFromBoundaries(ctx: BuildContext, make: (f: BoundaryFeature, c: [number, number]) => Suburb): void {
  ctx.suburbs = ctx.boundaries.map((f) => {
    const c = turf.pointOnFeature(f).geometry.coordinates;
    return make(f, [round(c[0], 5), round(c[1], 5)]);
  });
  ctx.byCode = new Map(ctx.suburbs.map((s) => [s.code, s]));
}
