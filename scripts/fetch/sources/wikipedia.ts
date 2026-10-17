/**
 * A short history and description of each locality: the lead section of its
 * English Wikipedia article (CC BY-SA 4.0), shown with attribution and a link.
 * An article is used only if its coordinates fall near the locality, so a
 * same-named place elsewhere is never picked up.
 */
import * as turf from '@turf/turf';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { readJsonOut, writeJson } from '../lib/common';
import { getJson } from '../lib/http';
import type { Fetcher } from './types';

const API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
/** Wikimedia asks automated clients to identify themselves. */
const HEADERS = { 'User-Agent': 'good-patch-data-refresh/1.0 (https://github.com/pixelgrit/good_patch)', 'Api-User-Agent': 'good-patch-data-refresh/1.0 (https://github.com/pixelgrit/good_patch)' };
/** How far the article's coordinates may sit from the locality's centre. */
const MAX_KM = 15;
/** Article titles that don't follow the "Name, Victoria" pattern. */
const TITLES: Record<string, string[]> = { Melbourne: ['Melbourne city centre'] };

interface Summary {
  type?: string;
  title?: string;
  extract?: string;
  coordinates?: { lat: number; lon: number };
  content_urls?: { desktop?: { page?: string } };
}

export interface About {
  title: string;
  extract: string;
  url: string;
}

async function lookup(name: string, centre: [number, number]): Promise<About | null> {
  const titles = TITLES[name] ?? [`${name}, Victoria`, name];
  for (const t of titles) {
    let s: Summary;
    try {
      s = await getJson<Summary>(`${API}${encodeURIComponent(t.replace(/ /g, '_'))}?redirect=true`, { headers: HEADERS, timeoutMs: 30_000, retries: 2 });
    } catch {
      continue; // 404: try the next title
    }
    if (s.type !== 'standard' || !s.extract || !s.content_urls?.desktop?.page) continue;
    const near = s.coordinates ? turf.distance(centre, [s.coordinates.lon, s.coordinates.lat], { units: 'kilometers' }) <= MAX_KM : /Victoria/.test(s.extract);
    if (!near) continue;
    return { title: s.title ?? t, extract: s.extract.trim(), url: s.content_urls.desktop.page };
  }
  return null;
}

export const wikipedia: Fetcher = {
  id: 'wikipedia',
  name: 'Wikipedia locality summaries',
  cadence: 'yearly',
  needs: ['abs-boundaries'],
  async run() {
    const sal = readJsonOut<FeatureCollection<Polygon | MultiPolygon, { code: string; name: string }>>('sal-metro.geojson');
    if (!sal) throw new Error('needs abs-boundaries output first');
    const out: Record<string, About> = {};
    const queue = [...sal.features];
    // A few requests at a time, as Wikimedia's API etiquette asks.
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let f = queue.shift(); f; f = queue.shift()) {
          const c = turf.pointOnFeature(f).geometry.coordinates as [number, number];
          const a = await lookup(f.properties.name, c);
          if (a) out[f.properties.code] = a;
        }
      }),
    );
    const n = Object.keys(out).length;
    if (n < sal.features.length * 0.5) throw new Error(`summaries found for only ${n} of ${sal.features.length} localities`);
    writeJson('wikipedia-sal.json', out);
    return { asAt: new Date().toISOString().slice(0, 10), url: 'https://en.wikipedia.org', rows: n, files: ['wikipedia-sal.json'], message: `${n} of ${sal.features.length} localities` };
  },
};
