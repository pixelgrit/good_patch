import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Agent, setGlobalDispatcher } from 'undici';

// Government servers can take minutes to start streaming large extracts;
// Node's default 5-minute header timeout cuts them off as "fetch failed".
setGlobalDispatcher(new Agent({ headersTimeout: 15 * 60_000, bodyTimeout: 15 * 60_000, connectTimeout: 60_000 }));

// Some agency sites reject non-browser user agents with 403 or a dropped connection.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15 propa-data-refresh/1.0',
  'Accept-Language': 'en-AU,en;q=0.9',
};

export interface GetOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
}

/** Error message including the network-level cause Node hides behind "fetch failed". */
export function describe(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts = [err.message];
  let c: unknown = (err as Error & { cause?: unknown }).cause;
  while (c) {
    if (c instanceof Error) {
      const code = (c as Error & { code?: string }).code;
      parts.push(code ? `${code}: ${c.message}` : c.message);
      c = (c as Error & { cause?: unknown }).cause;
    } else {
      parts.push(String(c));
      break;
    }
  }
  return parts.join(' <- ');
}

/** GET with timeout and retry (exponential back-off on network errors, 429 and 5xx). */
export async function get(url: string, opts: GetOptions = {}): Promise<Response> {
  const { headers = {}, timeoutMs = 300_000, retries = 3 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { Accept: '*/*', ...BROWSER_HEADERS, ...headers }, signal: ctrl.signal, redirect: 'follow' });
      clearTimeout(timer);
      if (res.ok) return res;
      const err = new Error(`HTTP ${res.status} for ${url}`);
      if (res.status !== 429 && res.status < 500) throw Object.assign(err, { fatal: true });
      lastErr = err;
    } catch (err) {
      clearTimeout(timer);
      if ((err as { fatal?: boolean }).fatal) throw err;
      lastErr = new Error(`${describe(err)} (${url})`);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 3000 * 2 ** attempt));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function getJson<T>(url: string, opts?: GetOptions): Promise<T> {
  const res = await get(url, { ...opts, headers: { Accept: 'application/json', ...opts?.headers } });
  return (await res.json()) as T;
}

export async function getText(url: string, opts?: GetOptions): Promise<string> {
  return (await get(url, opts)).text();
}

/**
 * Download to a file. If the server refuses with 403 (some agency firewalls
 * fingerprint Node's HTTP client), retry once with curl and the same headers.
 */
export async function download(url: string, dest: string, opts?: GetOptions): Promise<string> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    const res = await get(url, opts);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return dest;
  } catch (err) {
    if (!/HTTP 403/.test(String((err as Error).message))) throw err;
    const headers = { ...BROWSER_HEADERS, ...opts?.headers };
    const args = ['-fsSL', '--compressed', '--retry', '2', '-o', dest, ...Object.entries(headers).flatMap(([k, v]) => ['-H', `${k}: ${v}`]), url];
    try {
      execFileSync('curl', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      return dest;
    } catch (curlErr) {
      throw new Error(`${(err as Error).message}; curl also failed: ${String((curlErr as Error).message).split('\n')[0]}`);
    }
  }
}
