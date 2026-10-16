/**
 * ABS geography and SEIFA from the ABS ArcGIS services (geo.abs.gov.au).
 *  - SAL 2021 suburb boundaries for metro Melbourne
 *  - SA2 2021 boundaries (to apportion SA2 statistics to suburbs)
 *  - SEIFA 2021 IRSAD decile by SAL
 */
import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { queryAll } from '../lib/arcgis';
import { METRO_BBOX, writeCsv, writeJson } from '../lib/common';
import type { Fetcher } from './types';

const SAL = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/SAL/MapServer/0';
const SA2 = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/SA2/MapServer/0';
const SEIFA = 'https://geo.abs.gov.au/arcgis/rest/services/Hosted/ABS_Socio_Economic_Indexes_for_Areas_SEIFA_by_2021_SAL/FeatureServer/0';

const round = (g: Polygon | MultiPolygon) => turf.truncate(turf.feature(g), { precision: 5, coordinates: 2 }).geometry;

export const absBoundaries: Fetcher = {
  id: 'abs-boundaries',
  name: 'ABS SAL and SA2 boundaries (ASGS 2021)',
  cadence: 'static',
  async run() {
    const sal = await queryAll(SAL, {
      where: "state_code_2021='2'",
      bbox: METRO_BBOX,
      outFields: ['sal_code_2021', 'sal_name_2021'],
      geometry: true,
      maxAllowableOffset: 0.0002,
      pageSize: 500,
    });
    const salOut = sal
      .filter((f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
      .map((f) => ({
        type: 'Feature' as const,
        geometry: round(f.geometry as Polygon | MultiPolygon),
        properties: { code: String(f.properties.sal_code_2021), name: String(f.properties.sal_name_2021).replace(/\s*\(Vic\.\)\s*$/, '') },
      }));
    if (salOut.length < 200) throw new Error(`only ${salOut.length} SAL features`);
    writeJson('sal-metro.geojson', turf.featureCollection(salOut));

    const sa2 = await queryAll(SA2, {
      where: "state_code_2021='2'",
      bbox: METRO_BBOX,
      outFields: ['sa2_code_2021', 'sa2_name_2021'],
      geometry: true,
      maxAllowableOffset: 0.0003,
      pageSize: 500,
    });
    const sa2Out = sa2
      .filter((f) => f.geometry)
      .map((f) => ({
        type: 'Feature' as const,
        geometry: round(f.geometry as Polygon | MultiPolygon),
        properties: { code: String(f.properties.sa2_code_2021), name: String(f.properties.sa2_name_2021) },
      }));
    if (sa2Out.length < 100) throw new Error(`only ${sa2Out.length} SA2 features`);
    writeJson('sa2-metro.geojson', turf.featureCollection(sa2Out));

    return { asAt: '2021-07-01', url: SAL, rows: salOut.length, files: ['sal-metro.geojson', 'sa2-metro.geojson'], message: `${salOut.length} suburbs, ${sa2Out.length} SA2s` };
  },
};

export const absSeifa: Fetcher = {
  id: 'abs-seifa',
  name: 'ABS SEIFA 2021 by suburb',
  cadence: 'static',
  async run() {
    const rows = await queryAll(SEIFA, { bbox: METRO_BBOX, outFields: ['sal_code_2021', 'irsad_state_decile'], pageSize: 1000 });
    const out = rows
      .filter((f) => f.properties.irsad_state_decile != null)
      .map((f) => ({ SAL_CODE_2021: String(f.properties.sal_code_2021), irsad_state_decile: Number(f.properties.irsad_state_decile), as_at: '2021-08-10' }));
    if (out.length < 200) throw new Error(`only ${out.length} SEIFA rows`);
    writeCsv('seifa-sal.csv', out);
    return { asAt: '2021-08-10', url: SEIFA, rows: out.length, files: ['seifa-sal.csv'] };
  },
};

/* ------------------------------------------------------------------ */
/* SA2 -> SAL apportionment by area overlap                             */
/* ------------------------------------------------------------------ */

type Area = Feature<Polygon | MultiPolygon, { code: string; name: string }>;

/** For each SAL: the SA2s it overlaps and the share of each SA2's area that falls inside the SAL. */
export function sa2ToSal(sal: Area[], sa2: Area[]): Map<string, { sa2: string; share: number; salShare: number }[]> {
  const sa2Index = sa2.map((f) => ({ f, bb: turf.bbox(f), area: turf.area(f) }));
  const out = new Map<string, { sa2: string; share: number; salShare: number }[]>();
  for (const s of sal) {
    const bb = turf.bbox(s);
    const salArea = turf.area(s);
    const parts: { sa2: string; share: number; salShare: number }[] = [];
    for (const { f, bb: o, area } of sa2Index) {
      if (o[0] > bb[2] || o[2] < bb[0] || o[1] > bb[3] || o[3] < bb[1]) continue;
      let hit: Feature<Polygon | MultiPolygon> | null = null;
      try {
        hit = turf.intersect(turf.featureCollection([s, f]));
      } catch {
        hit = null;
      }
      if (!hit) continue;
      const a = turf.area(hit);
      if (a / salArea < 0.01) continue;
      parts.push({ sa2: f.properties.code, share: a / area, salShare: a / salArea });
    }
    if (parts.length) out.set(s.properties.code, parts);
  }
  return out;
}
