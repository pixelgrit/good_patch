import { getJson } from './http';

/** DataVic's CKAN catalogue. data.gov.au mirrors it and is used as a fallback. */
const CATALOGUES = ['https://discover.data.vic.gov.au/api/3/action', 'https://data.gov.au/data/api/3/action'];

export interface CkanResource {
  id: string;
  name: string;
  url: string;
  format: string;
  created?: string;
  last_modified?: string | null;
  period_start?: string;
  period_end?: string;
}

interface CkanPackage {
  name: string;
  title: string;
  metadata_modified: string;
  resources: CkanResource[];
}

export async function packageShow(id: string): Promise<CkanPackage> {
  let lastErr: unknown;
  for (const base of CATALOGUES) {
    try {
      const res = await getJson<{ success: boolean; result: CkanPackage }>(`${base}/package_show?id=${encodeURIComponent(id)}`);
      if (res.success) return res.result;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`CKAN package ${id} not found`);
}

/** Resources matching the formats, newest first (by period end, last modified or created date). */
export async function resources(id: string, formats: string[]): Promise<CkanResource[]> {
  const pkg = await packageShow(id);
  const fmt = formats.map((f) => f.toLowerCase());
  const list = pkg.resources.filter((r) => fmt.includes((r.format || '').toLowerCase()) || fmt.some((f) => r.url.toLowerCase().includes(`.${f}`)));
  if (!list.length) throw new Error(`no ${formats.join('/')} resource in ${id}`);
  const when = (r: CkanResource) => r.period_end || r.last_modified || r.created || '';
  return list.sort((a, b) => when(b).localeCompare(when(a)));
}

export async function latestResource(id: string, formats: string[]): Promise<CkanResource> {
  return (await resources(id, formats))[0];
}
