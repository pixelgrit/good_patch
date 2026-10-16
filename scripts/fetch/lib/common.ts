import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
/** Small, normalised outputs that are committed to the repo and read by the data build. */
export const SOURCES_DIR = path.join(ROOT, 'data/sources');
/** Large raw downloads (git-ignored). */
export const CACHE_DIR = path.join(ROOT, 'data/cache');

/** Metro Melbourne extent [minLng, minLat, maxLng, maxLat]. */
export const METRO_BBOX: [number, number, number, number] = [144.55, -38.2, 145.45, -37.55];

export function out(file: string): string {
  fs.mkdirSync(SOURCES_DIR, { recursive: true });
  return path.join(SOURCES_DIR, file);
}

export function cache(file: string): string {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  return path.join(CACHE_DIR, file);
}

export function writeJson(file: string, data: unknown): void {
  fs.writeFileSync(out(file), JSON.stringify(data));
}

export function readJsonOut<T>(file: string): T | null {
  const p = out(file);
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as T) : null;
}

/** Write rows as CSV with a header. Values are quoted only when needed. */
export function writeCsv(file: string, rows: Record<string, string | number | null | undefined>[]): void {
  if (!rows.length) throw new Error(`refusing to write empty ${file}`);
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  fs.writeFileSync(out(file), [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n') + '\n');
}

/** Upper-case, strip "(Vic.)", punctuation and common spelling variants so names from different agencies line up. */
export function suburbKey(name: string): string {
  let n = name
    .toUpperCase()
    .replace(/\(VIC\.?\)/g, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\bSAINT\b/g, 'ST')
    .replace(/\bMOUNT\b/g, 'MT')
    .replace(/\s+/g, ' ')
    .trim();
  // Directional prefixes: "EAST ST KILDA" -> "ST KILDA EAST"
  const m = n.match(/^(NORTH|SOUTH|EAST|WEST) (.+)$/);
  if (m && !['MELBOURNE', 'YARRA', 'WHARF', 'KINGSVILLE'].includes(m[2])) n = `${m[2]} ${m[1]}`;
  return n;
}

export function parseNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[$,%\s]/g, '');
  if (s === '' || s === '-' || /^n\.?a\.?$/i.test(s) || s === '*') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface ManifestEntry {
  id: string;
  name: string;
  status: 'ok' | 'skipped' | 'failed';
  fetchedAt: string;
  /** Latest period the data covers, ISO date. */
  asAt?: string;
  url?: string;
  rows?: number;
  files?: string[];
  message?: string;
}
