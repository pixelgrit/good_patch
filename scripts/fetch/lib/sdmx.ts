import { getJson, getText } from './http';

const BASE = 'https://api.data.abs.gov.au';

export interface SdmxRow {
  /** Dimension id -> { code, label } */
  dims: Record<string, { code: string; label: string }>;
  period: string;
  value: number | null;
}

/**
 * Fetch an ABS Data API dataflow as SDMX-CSV with labels, so filters can be
 * chosen by meaning ("Total", "Number") rather than codes that may change.
 */
export async function fetchSdmx(dataflow: string, opts: { key?: string; startPeriod?: string; endPeriod?: string } = {}): Promise<SdmxRow[]> {
  const params = new URLSearchParams({ detail: 'dataonly' });
  if (opts.startPeriod) params.set('startPeriod', opts.startPeriod);
  if (opts.endPeriod) params.set('endPeriod', opts.endPeriod);
  const url = `${BASE}/data/ABS,${dataflow}/${opts.key ?? 'all'}?${params}`;
  const text = await getText(url, { headers: { Accept: 'application/vnd.sdmx.data+csv;labels=both' }, timeoutMs: 600_000 });
  return parseSdmxCsv(text);
}

export interface SdmxDimension {
  id: string;
  position: number;
  codes: { id: string; name: string }[];
}

/** Dimensions of a dataflow, in key order, with their code lists. */
export async function fetchStructure(dataflow: string): Promise<SdmxDimension[]> {
  type Named = { id: string; name?: string | Record<string, string>; names?: Record<string, string> };
  const label = (n: Named) => (typeof n.name === 'string' ? n.name : (n.name?.en ?? n.names?.en ?? Object.values(n.name ?? n.names ?? {})[0] ?? n.id));
  const doc = await getJson<{
    data: {
      dataStructures: { dataStructureComponents: { dimensionList: { dimensions: { id: string; position: number; localRepresentation?: { enumeration?: string } }[] } } }[];
      codelists?: (Named & { codes?: Named[] })[];
    };
  }>(`${BASE}/dataflow/ABS/${dataflow}/latest?references=all`, { headers: { Accept: 'application/vnd.sdmx.structure+json' } });
  const lists = new Map((doc.data.codelists ?? []).map((c) => [c.id, (c.codes ?? []).map((x) => ({ id: x.id, name: label(x) }))]));
  const dims = doc.data.dataStructures[0].dataStructureComponents.dimensionList.dimensions;
  return dims
    .map((d) => {
      const listId = d.localRepresentation?.enumeration?.match(/=\w+:([^()]+)\(/)?.[1] ?? '';
      return { id: d.id, position: d.position, codes: lists.get(listId) ?? [] };
    })
    .sort((a, b) => a.position - b.position);
}

/**
 * Build a data key that selects one member per dimension using the same
 * label preferences as pickMembers, leaving `wildcard` dimensions (and any it
 * can't decide) open. Keeps ABS responses small enough not to time out.
 */
export function buildKey(dims: SdmxDimension[], wildcard: string[], prefer: Record<string, RegExp[]> = {}): { key: string; chosen: Record<string, string> } {
  const chosen: Record<string, string> = {};
  const parts = dims.map((d) => {
    if (wildcard.includes(d.id) || d.codes.length <= 1 || d.codes.length > 300) return '';
    for (const p of [...(prefer[d.id] ?? []), /^total/i, /\btotal\b/i]) {
      const hit = d.codes.find((c) => p.test(c.name));
      if (hit) {
        chosen[d.id] = `${hit.id} (${hit.name})`;
        return hit.id;
      }
    }
    return '';
  });
  return { key: parts.join('.'), chosen };
}

export function parseSdmxCsv(text: string): SdmxRow[] {
  const lines = splitCsv(text);
  const [header, ...body] = lines;
  if (!header) return [];
  const ids = header.map((h) => h.split(':')[0].trim());
  const iPeriod = ids.indexOf('TIME_PERIOD');
  const iValue = ids.indexOf('OBS_VALUE');
  if (iPeriod < 0 || iValue < 0) throw new Error(`unexpected SDMX-CSV header: ${header.join(',')}`);
  const dimIdx = ids.map((id, i) => ({ id, i })).filter(({ id, i }) => i !== iPeriod && i !== iValue && id !== 'DATAFLOW' && id !== 'STRUCTURE' && id !== 'STRUCTURE_ID' && id !== 'ACTION');
  return body
    .filter((r) => r.length >= header.length)
    .map((r) => {
      const dims: SdmxRow['dims'] = {};
      for (const { id, i } of dimIdx) {
        const raw = r[i] ?? '';
        const c = raw.indexOf(':');
        dims[id] = c >= 0 ? { code: raw.slice(0, c).trim(), label: raw.slice(c + 1).trim() } : { code: raw.trim(), label: raw.trim() };
      }
      const v = Number(r[iValue]);
      return { dims, period: r[iPeriod], value: r[iValue] === '' || !Number.isFinite(v) ? null : v };
    });
}

/**
 * For every dimension except those named, keep a single member: the one whose
 * label matches `prefer` patterns (first match wins), else "Total", else the only value.
 * Returns the filtered rows and a description of what was chosen.
 */
export function pickMembers(rows: SdmxRow[], keep: string[], prefer: Record<string, RegExp[]> = {}): { rows: SdmxRow[]; chosen: Record<string, string> } {
  if (!rows.length) return { rows, chosen: {} };
  const chosen: Record<string, string> = {};
  let out = rows;
  for (const dim of Object.keys(rows[0].dims)) {
    if (keep.includes(dim)) continue;
    const members = new Map<string, string>();
    for (const r of out) members.set(r.dims[dim].code, r.dims[dim].label);
    if (members.size <= 1) continue;
    const entries = [...members.entries()];
    const patterns = [...(prefer[dim] ?? []), /^total/i, /\btotal\b/i];
    let pick: [string, string] | undefined;
    for (const p of patterns) {
      pick = entries.find(([, label]) => p.test(label));
      if (pick) break;
    }
    if (!pick) throw new Error(`cannot choose a member for ${dim}: ${entries.map(([c, l]) => `${c}=${l}`).join('; ')}`);
    chosen[dim] = `${pick[0]} (${pick[1]})`;
    out = out.filter((r) => r.dims[dim].code === pick![0]);
  }
  return { rows: out, chosen };
}

function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
