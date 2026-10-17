/**
 * A short description and history of each locality: the lead and the start of
 * the History section of its English Wikipedia article (CC BY-SA 4.0), shown
 * with attribution and a link.
 * An article is used only if its coordinates fall near the locality, so a
 * same-named place elsewhere is never picked up.
 */
import * as turf from '@turf/turf';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { readJsonOut, writeJson } from '../lib/common';
import { getJson } from '../lib/http';
import type { Fetcher } from './types';

const API = 'https://en.wikipedia.org/w/api.php';
/** Wikimedia asks automated clients to identify themselves. */
const HEADERS = { 'User-Agent': 'good-patch-data-refresh/1.0 (https://github.com/pixelgrit/good_patch)', 'Api-User-Agent': 'good-patch-data-refresh/1.0 (https://github.com/pixelgrit/good_patch)' };
/** How far the article's coordinates may sit from the locality's centre. */
const MAX_KM = 15;
/** Article titles that don't follow the "Name, Victoria" pattern. */
const TITLES: Record<string, string[]> = { Melbourne: ['Melbourne city centre'] };

interface Page {
  title: string;
  missing?: string;
  extract?: string;
  fullurl?: string;
  coordinates?: { lat: number; lon: number }[];
  pageprops?: { disambiguation?: string };
}

export interface About {
  title: string;
  /** The article's lead: what and where the place is. */
  extract: string;
  /** The start of its History section, if it has one. */
  history?: string;
  url: string;
}

/** Paragraphs of plain text, up to roughly `max` characters, ending on a full sentence. */
export function clip(text: string, paragraphs: number, max: number): string {
  const paras = text.split(/\n+/).map((p) => p.trim()).filter((p) => p.length > 40).slice(0, paragraphs);
  let out = '';
  for (const p of paras) {
    if (out && out.length + p.length > max) break;
    out = out ? `${out}\n${p}` : p;
  }
  if (out.length > max) {
    const cut = out.slice(0, max);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
    out = end > 100 ? cut.slice(0, end + 1) : cut;
  }
  return out.trim();
}

/** Split explaintext into the lead and the body of the "History" section. */
export function sections(text: string): { lead: string; history: string } {
  const parts = text.split(/\n(={2,})\s*([^=\n]+?)\s*\1\n/);
  const lead = parts[0] ?? '';
  let history = '';
  for (let i = 1; i + 2 < parts.length + 1; i += 3) {
    if (parts[i] === '==' && /^history/i.test(parts[i + 1] ?? '')) {
      // Include any subsections up to the next top-level heading.
      let body = parts[i + 2] ?? '';
      for (let j = i + 3; j + 2 < parts.length + 1 && parts[j] !== '=='; j += 3) body += `\n${parts[j + 2] ?? ''}`;
      history = body;
      break;
    }
  }
  return { lead, history };
}

async function lookup(name: string, centre: [number, number]): Promise<About | null> {
  const titles = TITLES[name] ?? [`${name}, Victoria`, name];
  for (const t of titles) {
    const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'extracts|coordinates|info|pageprops', explaintext: '1', inprop: 'url', titles: t });
    let page: Page | undefined;
    try {
      const r = await getJson<{ query?: { pages?: Page[] } }>(`${API}?${params}`, { headers: HEADERS, timeoutMs: 60_000, retries: 2 });
      page = r.query?.pages?.[0];
    } catch {
      continue;
    }
    if (!page || page.missing !== undefined || page.pageprops?.disambiguation !== undefined || !page.extract || !page.fullurl) continue;
    const c = page.coordinates?.[0];
    const near = c ? turf.distance(centre, [c.lon, c.lat], { units: 'kilometers' }) <= MAX_KM : /Victoria/.test(page.extract.slice(0, 400));
    if (!near) continue;
    const { lead, history } = sections(page.extract);
    const extract = clip(lead, 2, 700);
    if (!extract) continue;
    const h = clip(history, 3, 900);
    return { title: page.title, extract, ...(h ? { history: h } : {}), url: page.fullurl };
  }
  return null;
}

export const wikipedia: Fetcher = {
  id: 'wikipedia',
  name: 'Wikipedia locality summaries',
  cadence: 'yearly',
  // 2: adds the History section.
  version: 2,
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
