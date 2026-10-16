import fs from 'node:fs';
import path from 'node:path';
import type { Feature, FeatureCollection, LineString, MultiLineString, MultiPolygon, Point, Polygon } from 'geojson';
import { METRIC_BY_KEY } from '../../src/lib/metrics';
import type { MetricValue, PropertyType, SeriesKey, SeriesPoint, SourceId, Suburb } from '../../src/lib/types';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const RAW_DIR = path.join(ROOT, 'data/raw');
export const OUT_DIR = path.join(ROOT, 'public/data');

export type BoundaryFeature = Feature<Polygon | MultiPolygon, { code: string; name: string; lga?: string; postcode?: string }>;

export interface TransportFeatures {
  tramLines: FeatureCollection<LineString | MultiLineString, { route: string; name: string }>;
  tramStops: FeatureCollection<Point, { name: string; routes: string }>;
  trainLines: FeatureCollection<LineString | MultiLineString, { route: string; name: string }>;
  trainStations: FeatureCollection<Point, { name: string; line: string }>;
}

export interface BuildContext {
  args: Set<string>;
  boundaries: BoundaryFeature[];
  transport: TransportFeatures | null;
  suburbs: Suburb[];
  byCode: Map<string, Suburb>;
  usedMock: boolean;
  /** Boundaries or transport lines came from the approximate mock geometry. */
  approxGeometry: boolean;
  log: (msg: string) => void;
}

export const SOURCES_DIR = path.join(ROOT, 'data/sources');

/** Normalised source files: data/sources/ (written by `npm run fetch`), else data/raw/ (dropped in by hand). */
export function rawPath(file: string): string {
  const fetched = path.join(SOURCES_DIR, file);
  return fs.existsSync(fetched) ? fetched : path.join(RAW_DIR, file);
}

export function rawExists(file: string): boolean {
  return fs.existsSync(rawPath(file));
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(rawPath(file), 'utf8')) as T;
}

/** Minimal CSV parser (quoted fields, commas, CRLF). Returns objects keyed by header. */
export function readCsv(file: string): Record<string, string>[] {
  const text = fs.readFileSync(rawPath(file), 'utf8').replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((x) => x.trim() !== ''));
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export function num(v: string | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v.replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(vic\.?\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function findByName(ctx: BuildContext, name: string): Suburb | undefined {
  const n = normaliseName(name);
  return ctx.suburbs.find((s) => normaliseName(s.name) === n);
}

export function emptySuburb(f: BoundaryFeature, centroid: [number, number]): Suburb {
  return {
    code: f.properties.code,
    name: f.properties.name,
    postcode: f.properties.postcode ?? '',
    lga: f.properties.lga ?? '',
    centroid,
    common: {},
    houses: { metrics: {}, series: {} },
    units: { metrics: {}, series: {} },
    zones: null,
    access: { tramShare400: 0, tramShare800: 0, tramRoutes: [], nearestTramStopM: null, nearestStation: null, trainLines: [] },
    overlays: null,
    unitShare: null,
    renterShare: null,
  };
}

/** Write one metric value with provenance. `type` is ignored for common metrics. */
export function setMetric(
  s: Suburb,
  key: string,
  value: number | null,
  source: SourceId,
  asAt: string,
  type?: PropertyType,
  mock = false,
  approx = false,
): void {
  const def = METRIC_BY_KEY[key];
  if (!def) throw new Error(`Unknown metric "${key}"`);
  const mv: MetricValue = { value: value == null ? null : round(value, 4), source, asAt };
  if (mock) mv.mock = true;
  if (approx) mv.approx = true;
  if (def.scope === 'common') s.common[key] = mv;
  else {
    if (!type) throw new Error(`Metric "${key}" needs a property type`);
    s[type].metrics[key] = mv;
  }
}

export function setSeries(s: Suburb, type: PropertyType, key: SeriesKey, points: SeriesPoint[]): void {
  s[type].series[key] = points;
}

export function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
