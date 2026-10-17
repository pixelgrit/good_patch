/**
 * Victorian spatial data:
 *  - Vicmap Planning zones and overlays (WFS), summarised per suburb
 *  - PTV GTFS Schedule, metro tram and train routes and stops
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, LineString, MultiPolygon, Polygon } from 'geojson';
import { cache, CACHE_DIR, readJsonOut, writeCsv, writeJson } from '../lib/common';
import { download, getJson } from '../lib/http';
import type { Fetcher } from './types';

/* ------------------------------------------------------------------ */
/* Vicmap Planning                                                       */
/* ------------------------------------------------------------------ */

const WFS = 'https://opendata.maps.vic.gov.au/geoserver/wfs';

type Area = Feature<Polygon | MultiPolygon, Record<string, unknown>>;

async function wfsAll(typeName: string, cql: string): Promise<Area[]> {
  const pageSize = 5000;
  const all: Area[] = [];
  for (let start = 0; ; start += pageSize) {
    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: typeName,
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
      propertyName: 'zone_code,geom',
      count: String(pageSize),
      startIndex: String(start),
      sortBy: 'pfi',
      CQL_FILTER: cql,
    });
    const page = await getJson<FeatureCollection<Polygon | MultiPolygon, Record<string, unknown>>>(`${WFS}?${params}`, { timeoutMs: 600_000 });
    all.push(...page.features);
    if (page.features.length < pageSize) break;
  }
  return all;
}

/* ------------------------------------------------------------------ */
/* Vicmap Admin: council and postcode                                   */
/* ------------------------------------------------------------------ */

/** One WFS page of every attribute (field names vary between Vicmap layers). */
async function wfsPage(typeName: string, cql: string): Promise<Area[]> {
  const params = new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: typeName, outputFormat: 'application/json', srsName: 'EPSG:4326', count: '5000', CQL_FILTER: cql });
  const page = await getJson<FeatureCollection<Polygon | MultiPolygon, Record<string, unknown>>>(`${WFS}?${params}`, { timeoutMs: 600_000 });
  return page.features.filter((f) => f.geometry);
}

/** The first property whose name matches, in order of preference. */
function pickField(f: Area | undefined, patterns: RegExp[], what: string): string {
  const keys = Object.keys(f?.properties ?? {});
  for (const p of patterns) {
    const k = keys.find((x) => p.test(x));
    if (k) return k;
  }
  throw new Error(`no ${what} field among ${keys.join(', ')}`);
}

/**
 * For each suburb, the values of the polygons covering it, largest share first.
 * Values covering less than `minShare` of the suburb are dropped (the largest is always kept).
 */
function overlaps(sal: Feature<Polygon | MultiPolygon, { code: string }>[], areas: Area[], field: string, minShare: number): Map<string, string[]> {
  const idx = areas.map((f) => ({ f: turf.simplify(f, { tolerance: 0.0002, highQuality: false }), bb: turf.bbox(f), v: String(f.properties[field] ?? '') }));
  const out = new Map<string, string[]>();
  for (const s of sal) {
    const bb = turf.bbox(s);
    const total = turf.area(s);
    const byValue = new Map<string, number>();
    for (const { f, bb: o, v } of idx) {
      if (!v || o[0] > bb[2] || o[2] < bb[0] || o[1] > bb[3] || o[3] < bb[1]) continue;
      let a = 0;
      try {
        const hit = turf.intersect(turf.featureCollection([s, f]));
        a = hit ? turf.area(hit) : 0;
      } catch {
        a = 0;
      }
      if (a > 0) byValue.set(v, (byValue.get(v) ?? 0) + a);
    }
    const ranked = [...byValue.entries()].sort((x, y) => y[1] - x[1]);
    const kept = ranked.filter(([, a], i) => i === 0 || a / total >= minShare).map(([v]) => v);
    if (kept.length) out.set(s.properties.code, kept);
  }
  return out;
}

const titleCase = (v: string) => v.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\s*\((city|shire|rural city|borough)\)\s*$/i, '');

export const vicmapAdmin: Fetcher = {
  id: 'vicmap-admin',
  name: 'Vicmap Admin council and postcode areas',
  cadence: 'yearly',
  // 2: every postcode covering at least 10% of the suburb.
  version: 2,
  needs: ['abs-boundaries'],
  async run() {
    const sal = readJsonOut<FeatureCollection<Polygon | MultiPolygon, { code: string; name: string }>>('sal-metro.geojson');
    if (!sal) throw new Error('needs abs-boundaries output first');
    const [minx, miny, maxx, maxy] = turf.bbox(sal);
    const bbox = `BBOX(geom,${miny},${minx},${maxy},${maxx})`;
    const lgas = await wfsPage('open-data-platform:lga_polygon', bbox);
    const pcs = await wfsPage('open-data-platform:postcode_polygon', bbox);
    if (lgas.length < 20 || pcs.length < 100) throw new Error(`only ${lgas.length} council and ${pcs.length} postcode polygons`);
    const lgaField = pickField(lgas[0], [/^lga_name$/i, /^lga$/i, /lga.*name/i, /^name$/i], 'council name');
    const pcField = pickField(pcs[0], [/^postcode$/i, /postcode/i], 'postcode');
    const lgaOf = overlaps(sal.features, lgas, lgaField, 1);
    // Suburbs often span postcodes (Melbourne is 3000 and 3004): keep each one covering 10% or more.
    const pcOf = overlaps(sal.features, pcs, pcField, 0.1);
    const out = sal.features.map((s) => ({
      SAL_CODE_2021: s.properties.code,
      lga: titleCase(lgaOf.get(s.properties.code)?.[0] ?? ''),
      postcode: [...(pcOf.get(s.properties.code) ?? [])].sort().join(', '),
    }));
    const n = out.filter((r) => r.lga && r.postcode).length;
    if (n < out.length * 0.9) throw new Error(`council and postcode found for only ${n} of ${out.length} suburbs`);
    writeCsv('admin-sal.csv', out);
    return { asAt: new Date().toISOString().slice(0, 10), url: WFS, rows: out.length, files: ['admin-sal.csv'], message: `${lgas.length} council and ${pcs.length} postcode polygons (fields ${lgaField}, ${pcField})` };
  },
};

export const vicmapPlanning: Fetcher = {
  id: 'vicmap-planning',
  name: 'Vicmap Planning zones and overlays',
  cadence: 'monthly',
  needs: ['abs-boundaries'],
  async run() {
    const sal = readJsonOut<FeatureCollection<Polygon | MultiPolygon, { code: string; name: string }>>('sal-metro.geojson');
    if (!sal) throw new Error('needs abs-boundaries output first');
    const [minx, miny, maxx, maxy] = turf.bbox(sal);
    // The layers are stored in GDA2020 (EPSG:7844, latitude first); a BBOX
    // without a CRS argument uses that native order. Naming a CRS matches nothing.
    const bbox = `BBOX(geom,${miny},${minx},${maxy},${maxx})`;
    const zones = await wfsAll('open-data-platform:plan_zone', `${bbox} AND (zone_code LIKE 'NRZ%' OR zone_code LIKE 'GRZ%' OR zone_code LIKE 'RGZ%')`);
    const overlays = await wfsAll('open-data-platform:plan_overlay', `${bbox} AND (zone_code LIKE 'LSIO%' OR zone_code LIKE 'FO%' OR zone_code LIKE 'SBO%' OR zone_code LIKE 'BMO%' OR zone_code LIKE 'HO%')`);
    if (zones.length < 100) throw new Error(`only ${zones.length} zone polygons`);

    const index = (fs: Area[]) => fs.filter((f) => f.geometry).map((f) => ({ f, bb: turf.bbox(f), code: String(f.properties.zone_code ?? '').replace(/\d+$/, '') }));
    const zIdx = index(zones);
    const oIdx = index(overlays);
    const near = <T extends { bb: number[] }>(idx: T[], bb: number[]) => idx.filter(({ bb: o }) => !(o[0] > bb[2] || o[2] < bb[0] || o[1] > bb[3] || o[3] < bb[1]));

    const rows = [];
    for (const s of sal.features) {
      const bb = turf.bbox(s);
      const total = turf.area(s);
      const area: Record<string, number> = { NRZ: 0, GRZ: 0, RGZ: 0 };
      for (const z of near(zIdx, bb)) {
        if (!(z.code in area)) continue;
        try {
          const hit = turf.intersect(turf.featureCollection([s, z.f]));
          if (hit) area[z.code] += turf.area(hit);
        } catch {
          /* skip invalid geometry */
        }
      }
      const flags = { flood: 0, bushfire: 0, heritage: 0 };
      for (const o of near(oIdx, bb)) {
        if (!turf.booleanIntersects(s, o.f)) continue;
        if (['LSIO', 'FO', 'SBO'].includes(o.code)) flags.flood = 1;
        if (o.code === 'BMO') flags.bushfire = 1;
        if (o.code === 'HO') flags.heritage = 1;
      }
      const res = area.NRZ + area.GRZ + area.RGZ;
      rows.push({
        SAL_CODE_2021: s.properties.code,
        nrz: (area.NRZ / total).toFixed(4),
        grz: (area.GRZ / total).toFixed(4),
        rgz: (area.RGZ / total).toFixed(4),
        nrz_share_of_residential: res > 0 ? (area.NRZ / res).toFixed(4) : '',
        flood: flags.flood,
        bushfire: flags.bushfire,
        heritage: flags.heritage,
      });
    }
    writeCsv('planning-sal.csv', rows);
    const asAt = new Date().toISOString().slice(0, 10);
    return { asAt, url: WFS, rows: rows.length, files: ['planning-sal.csv'], message: `${zones.length} zone and ${overlays.length} overlay polygons` };
  },
};

/* ------------------------------------------------------------------ */
/* PTV GTFS Schedule                                                     */
/* ------------------------------------------------------------------ */

const GTFS_URL = 'https://opendata.transport.vic.gov.au/dataset/3f4e292e-7f8a-4ffe-831f-1953be0fe448/resource/fb152201-859f-4882-9206-b768060b50ad/download/gtfs.zip';
/** Folders inside the PTV GTFS zip: 2 = metropolitan train, 3 = metropolitan tram. */
const MODES = { '1': 'REGIONAL TRAIN', '2': 'METRO TRAIN', '3': 'METRO TRAM' } as const;

function readGtfs(file: string): Record<string, string>[] {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const keys = splitLine(lines[0]);
  return lines.slice(1).map((l) => {
    const v = splitLine(l);
    return Object.fromEntries(keys.map((k, i) => [k, v[i] ?? '']));
  });
}

function splitLine(l: string): string[] {
  const out: string[] = [];
  let f = '';
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) {
      if (c === '"' && l[i + 1] === '"') {
        f += '"';
        i++;
      } else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(f);
      f = '';
    } else f += c;
  }
  out.push(f);
  return out;
}

export const ptvGtfs: Fetcher = {
  id: 'ptv-gtfs',
  name: 'PTV GTFS Schedule (tram, metro and V/Line train)',
  cadence: 'monthly',
  // 2: adds V/Line regional trains.
  version: 2,
  async run() {
    const zip = await download(GTFS_URL, cache('gtfs.zip'), { timeoutMs: 900_000 });
    const root = path.join(CACHE_DIR, 'gtfs');
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root, { recursive: true });
    execFileSync('unzip', ['-o', '-q', zip, '-d', root]);

    const lines: Feature<LineString, Record<string, string>>[] = [];
    const stops: Feature<GeoJSON.Point, Record<string, string>>[] = [];
    let feedDate = '';
    for (const [folder, mode] of Object.entries(MODES)) {
      const inner = path.join(root, folder, 'google_transit.zip');
      if (!fs.existsSync(inner)) throw new Error(`GTFS folder ${folder} missing`);
      const dir = path.join(root, `mode-${folder}`);
      execFileSync('unzip', ['-o', '-q', inner, '-d', dir]);
      const routes = new Map(readGtfs(path.join(dir, 'routes.txt')).map((r) => [r.route_id, r]));
      const trips = readGtfs(path.join(dir, 'trips.txt'));
      const feed = readGtfs(path.join(dir, 'feed_info.txt'))[0];
      if (feed?.feed_start_date) feedDate = `${feed.feed_start_date.slice(0, 4)}-${feed.feed_start_date.slice(4, 6)}-${feed.feed_start_date.slice(6, 8)}`;

      // shape points, grouped by shape id
      const pts = new Map<string, [number, number, number][]>();
      for (const s of readGtfs(path.join(dir, 'shapes.txt'))) {
        const a = pts.get(s.shape_id) ?? [];
        a.push([Number(s.shape_pt_lon), Number(s.shape_pt_lat), Number(s.shape_pt_sequence)]);
        pts.set(s.shape_id, a);
      }
      // longest shape per route and direction
      const best = new Map<string, { shape: string; n: number; route: Record<string, string> }>();
      for (const t of trips) {
        const route = routes.get(t.route_id);
        if (!route || !t.shape_id) continue;
        const name = route.route_short_name || route.route_long_name;
        const key = `${name}|${t.direction_id}`;
        const n = pts.get(t.shape_id)?.length ?? 0;
        if (n > (best.get(key)?.n ?? 0)) best.set(key, { shape: t.shape_id, n, route });
      }
      for (const { shape, route } of best.values()) {
        const coords = (pts.get(shape) ?? []).sort((a, b) => a[2] - b[2]).map(([x, y]) => [x, y] as [number, number]);
        if (coords.length < 2) continue;
        const line = turf.simplify(turf.lineString(coords), { tolerance: 0.00003, highQuality: false });
        lines.push(turf.truncate(turf.lineString(line.geometry.coordinates, { MODE: mode, SHORT_NAME: route.route_short_name, LONG_NAME: route.route_long_name }), { precision: 5 }) as Feature<LineString, Record<string, string>>);
      }
      for (const s of readGtfs(path.join(dir, 'stops.txt'))) {
        // Trains: one point per station (parent stations), trams: every stop.
        if (mode !== 'METRO TRAM' && s.location_type !== '1' && s.parent_station) continue;
        stops.push(turf.point([Number(Number(s.stop_lon).toFixed(5)), Number(Number(s.stop_lat).toFixed(5))], { MODE: mode, STOP_NAME: s.stop_name, ROUTEUSSP: '' }));
      }
    }
    if (lines.length < 20 || stops.length < 500) throw new Error(`GTFS gave ${lines.length} lines and ${stops.length} stops`);
    writeJson('transport-lines.geojson', turf.featureCollection(lines));
    writeJson('transport-stops.geojson', turf.featureCollection(stops));
    return { asAt: feedDate || new Date().toISOString().slice(0, 10), url: GTFS_URL, rows: lines.length + stops.length, files: ['transport-lines.geojson', 'transport-stops.geojson'], message: `${lines.length} route shapes, ${stops.length} stops` };
  },
};
