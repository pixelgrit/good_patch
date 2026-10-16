import fs from 'node:fs';
import path from 'node:path';

const UA = 'propa-data-refresh/1.0 (+https://github.com; personal research tool)';

export interface GetOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
}

/** GET with timeout and retry (exponential back-off on network errors and 5xx/429). */
export async function get(url: string, opts: GetOptions = {}): Promise<Response> {
  const { headers = {}, timeoutMs = 120_000, retries = 3 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: ctrl.signal, redirect: 'follow' });
      clearTimeout(timer);
      if (res.ok) return res;
      if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status} for ${url}`);
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err instanceof Error && /HTTP 4\d\d/.test(err.message) && !/HTTP 429/.test(err.message)) throw err;
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
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

/** Download to a file (streams to disk so large files stay out of memory). */
export async function download(url: string, dest: string, opts?: GetOptions): Promise<string> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await get(url, opts);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return dest;
}
