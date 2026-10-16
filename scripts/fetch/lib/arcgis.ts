import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { getJson } from './http';

export interface ArcgisQuery {
  where?: string;
  bbox?: [number, number, number, number];
  outFields: string[];
  geometry?: boolean;
  /** Generalisation tolerance in degrees (output SR 4326). */
  maxAllowableOffset?: number;
  pageSize?: number;
}

/** Page through an ArcGIS REST layer query, returning GeoJSON features in EPSG:4326. */
export async function queryAll(layerUrl: string, q: ArcgisQuery): Promise<Feature<Geometry | null, Record<string, unknown>>[]> {
  const pageSize = q.pageSize ?? 1000;
  const features: Feature<Geometry | null, Record<string, unknown>>[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({
      where: q.where ?? '1=1',
      outFields: q.outFields.join(','),
      returnGeometry: String(q.geometry ?? false),
      outSR: '4326',
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      orderByFields: q.outFields[0],
      f: 'geojson',
    });
    if (q.bbox) {
      params.set('geometry', q.bbox.join(','));
      params.set('geometryType', 'esriGeometryEnvelope');
      params.set('inSR', '4326');
      params.set('spatialRel', 'esriSpatialRelIntersects');
    }
    if (q.maxAllowableOffset) params.set('maxAllowableOffset', String(q.maxAllowableOffset));
    const page = await getJson<FeatureCollection<Geometry | null, Record<string, unknown>> & { error?: { message: string }; exceededTransferLimit?: boolean; properties?: { exceededTransferLimit?: boolean } }>(
      `${layerUrl}/query?${params}`,
    );
    if (page.error) throw new Error(`ArcGIS error: ${page.error.message}`);
    features.push(...(page.features ?? []));
    const more = page.exceededTransferLimit || page.properties?.exceededTransferLimit || (page.features?.length ?? 0) === pageSize;
    if (!more) break;
  }
  return features;
}
