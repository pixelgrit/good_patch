/**
 * ABS statistics:
 *  - Census General Community Profile DataPack for Victoria by SAL (static until the next Census)
 *  - Building approvals by SA2, monthly (ABS Data API, BA_SA2)
 *  - Estimated resident population by SA2, annual (ABS Data API, ABS_ANNUAL_ERP_ASGS2021)
 * SA2 figures are apportioned to suburbs by area overlap.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { cache, CACHE_DIR, parseNumber, readJsonOut, writeCsv } from '../lib/common';
import { download } from '../lib/http';
import { buildKey, fetchSdmx, fetchStructure, pickMembers, type SdmxRow } from '../lib/sdmx';
import { sa2ToSal } from './abs-geo';
import type { Fetcher } from './types';

/* ------------------------------------------------------------------ */
/* Census DataPack                                                      */
/* ------------------------------------------------------------------ */

const DATAPACK = (year: number) => `https://www.abs.gov.au/census/find-census-data/datapacks/download/${year}_GCP_SAL_for_VIC_short-header.zip`;

function readCsvFile(file: string): Record<string, string>[] {
  const [head, ...lines] = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const keys = head.split(',');
  return lines.map((l) => {
    const v = l.split(',');
    return Object.fromEntries(keys.map((k, i) => [k, v[i]]));
  });
}

function findCol(cols: string[], patterns: RegExp[], what: string): string {
  for (const p of patterns) {
    const c = cols.find((x) => p.test(x));
    if (c) return c;
  }
  throw new Error(`Census DataPack: no column for ${what} (have ${cols.slice(0, 12).join(', ')}…)`);
}

export const absCensus: Fetcher = {
  id: 'abs-census',
  name: 'ABS Census General Community Profile by suburb',
  cadence: 'static',
  async run() {
    // Try the newest Census first; the 2026 DataPacks are due in 2027.
    let year = 0;
    let zip = '';
    for (const y of [2026, 2021]) {
      try {
        zip = await download(DATAPACK(y), cache(`census-${y}.zip`));
        year = y;
        break;
      } catch {
        /* try older */
      }
    }
    if (!year) throw new Error('could not download a Census DataPack');
    const dir = path.join(CACHE_DIR, `census-${year}`);
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
    const files = execFileSync('find', [dir, '-name', '*.csv']).toString().trim().split('\n');
    const table = (g: string) => {
      const f = files.find((x) => new RegExp(`_${g}_VIC_SAL\\.csv$`, 'i').test(x));
      if (!f) throw new Error(`Census DataPack: ${g} table missing`);
      return readCsvFile(f);
    };
    const g02 = table('G02');
    const g37 = table('G37');
    const g36 = table('G36');
    const codeCol = (rows: Record<string, string>[]) => Object.keys(rows[0]).find((k) => /SAL_CODE/i.test(k))!;

    const inc = findCol(Object.keys(g02[0]), [/^Median_tot_hhd_inc_weekly$/i, /hhd_inc_weekly/i], 'median household income');
    const c37 = Object.keys(g37[0]);
    const outright = findCol(c37, [/^O_OR_Total$/i, /^O_OR.*Tot/i], 'owned outright');
    const mortgage = findCol(c37, [/^O_MTG_Total$/i, /^O_MTG.*Tot/i], 'owned with mortgage');
    const rented = findCol(c37, [/^R_Tot_Total$/i, /^R_Tot/i], 'rented');
    const c36 = Object.keys(g36[0]);
    const dwellings = findCol(c36, [/^Total_PDs_Dwellings$/i, /^Total_PDs/i, /^Total_Total/i], 'total private dwellings');
    // Apartment share is optional: if the column names change, the rest of the Census still loads.
    const optional = (patterns: RegExp[], what: string) => {
      try {
        return findCol(c36, patterns, what);
      } catch (err) {
        console.warn(`  ${(err as Error).message}`);
        return null;
      }
    };
    const flats = optional([/Flt_apart.*Tot.*Dw/i, /Flat.*apart.*Tot/i, /Flt_apart/i], 'flats and apartments');
    const occupied = optional([/^OPDs_Tot_OPDs_Dwellings$/i, /^OPDs_Tot/i, /^Total_OPDs/i], 'occupied private dwellings');

    const by = (rows: Record<string, string>[]) => new Map(rows.map((r) => [r[codeCol(rows)].replace(/^SAL/, ''), r]));
    const m02 = by(g02);
    const m36 = by(g36);
    const out = [];
    for (const [code, r] of by(g37)) {
      const own = (parseNumber(r[outright]) ?? 0) + (parseNumber(r[mortgage]) ?? 0);
      const rent = parseNumber(r[rented]) ?? 0;
      const stated = own + rent;
      const d = m36.get(code);
      const occ = d && occupied ? parseNumber(d[occupied]) : null;
      out.push({
        SAL_CODE_2021: code,
        owner_occupier_share: stated > 0 ? (own / stated).toFixed(4) : '',
        renter_share: stated > 0 ? (rent / stated).toFixed(4) : '',
        unit_share: d && occ && flats ? ((parseNumber(d[flats]) ?? 0) / occ).toFixed(4) : '',
        median_household_income_weekly: m02.get(code)?.[inc] ?? '',
        dwellings: d?.[dwellings] ?? '',
        as_at: year === 2026 ? '2026-08-11' : '2021-08-10',
      });
    }
    if (out.length < 1000) throw new Error(`only ${out.length} suburbs in Census DataPack`);
    writeCsv('census-sal.csv', out);
    return { asAt: out[0].as_at, url: DATAPACK(year), rows: out.length, files: ['census-sal.csv'], message: `Census ${year}` };
  },
};

/* ------------------------------------------------------------------ */
/* SA2 statistics from the ABS Data API                                 */
/* ------------------------------------------------------------------ */

type Area = FeatureCollection<Polygon | MultiPolygon, { code: string; name: string }>;

function apportionment() {
  const sal = readJsonOut<Area>('sal-metro.geojson');
  const sa2 = readJsonOut<Area>('sa2-metro.geojson');
  if (!sal || !sa2) throw new Error('needs abs-boundaries output first');
  return sa2ToSal(sal.features, sa2.features);
}

/** A narrow data key from the dataflow's structure, or "all" if the structure can't be read. */
async function structuredKey(dataflow: string, prefer: Record<string, RegExp[]>): Promise<{ key: string; chosen: Record<string, string> }> {
  try {
    const dims = await fetchStructure(dataflow);
    // Leave the region dimension open (thousands of codes).
    const regionDims = dims.filter((d) => d.codes.length > 300 || /ASGS|REGION$|SA2/.test(d.id) && !/TYPE/.test(d.id)).map((d) => d.id);
    return buildKey(dims, regionDims, prefer);
  } catch (err) {
    console.warn(`  structure for ${dataflow} unavailable, requesting all: ${(err as Error).message}`);
    return { key: 'all', chosen: {} };
  }
}

/** The dimension that holds SA2 codes (9 digits). */
function regionDim(rows: SdmxRow[]): string {
  const dims = Object.keys(rows[0]?.dims ?? {});
  const d = dims.find((k) => rows.slice(0, 500).filter((r) => /^\d{9}$/.test(r.dims[k].code)).length > 50);
  if (!d) throw new Error(`no SA2 region dimension among ${dims.join(', ')}`);
  return d;
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
}

function periodToDate(p: string): string {
  if (/^\d{4}-\d{2}$/.test(p)) return new Date(Date.UTC(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 0)).toISOString().slice(0, 10);
  if (/^\d{4}$/.test(p)) return `${p}-06-30`;
  return p;
}

export const absApprovals: Fetcher = {
  id: 'abs-approvals',
  name: 'ABS Building Approvals by SA2 (monthly)',
  cadence: 'monthly',
  needs: ['abs-boundaries'],
  async run() {
    const prefer = {
      MEASURE: [/dwelling/i, /number/i],
      BUILDING_TYPE: [/total residential/i, /^total/i],
      TYPE_OF_BUILDING: [/total residential/i, /^total/i],
      BUILDING_CLASS: [/total residential/i, /^total/i],
      WORK_TYPE: [/^total/i, /new/i],
      TYPE_OF_WORK: [/^total/i, /new/i],
      SECTOR: [/^total/i],
      SECTOR_OF_OWNERSHIP: [/^total/i],
      REGION_TYPE: [/SA2|statistical area level 2/i],
      FREQ: [/month/i],
    };
    const key = await structuredKey('BA_SA2', prefer);
    const raw = await fetchSdmx('BA_SA2', { key: key.key, startPeriod: monthsAgo(14) });
    if (!raw.length) throw new Error('BA_SA2 returned no rows');
    const region = regionDim(raw);
    const picked = pickMembers(raw.filter((r) => r.dims[region].code.startsWith('2')), [region], prefer);
    const rows = picked.rows;
    const chosen = { ...key.chosen, ...picked.chosen };
    const periods = [...new Set(rows.map((r) => r.period))].sort();
    const last12 = new Set(periods.slice(-12));
    const asAt = periodToDate(periods[periods.length - 1]);
    const bySa2 = new Map<string, number>();
    for (const r of rows) if (last12.has(r.period) && r.value != null) bySa2.set(r.dims[region].code, (bySa2.get(r.dims[region].code) ?? 0) + r.value);
    const map = apportionment();
    const out = [];
    for (const [sal, parts] of map) {
      let total = 0;
      let seen = false;
      for (const p of parts) {
        const v = bySa2.get(p.sa2);
        if (v == null) continue;
        total += v * p.share;
        seen = true;
      }
      if (seen) out.push({ SAL_CODE_2021: sal, approvals_12m: Math.round(total), as_at: asAt });
    }
    if (out.length < 100) throw new Error(`only ${out.length} suburbs with approvals`);
    writeCsv('approvals-sal.csv', out);
    return { asAt, url: 'https://data.api.abs.gov.au/rest/data/ABS,BA_SA2', rows: out.length, files: ['approvals-sal.csv'], message: `12 months to ${asAt}; ${JSON.stringify(chosen)}` };
  },
};

export const absPopulation: Fetcher = {
  id: 'abs-population',
  name: 'ABS Estimated Resident Population by SA2 (annual)',
  cadence: 'yearly',
  needs: ['abs-boundaries'],
  async run() {
    const year = new Date().getUTCFullYear();
    const prefer = { MEASURE: [/estimated resident population/i, /\berp\b/i], REGION_TYPE: [/SA2|statistical area level 2/i], SEX: [/persons/i, /^total/i], FREQ: [/annual/i] };
    const key = await structuredKey('ABS_ANNUAL_ERP_ASGS2021', prefer);
    const raw = await fetchSdmx('ABS_ANNUAL_ERP_ASGS2021', { key: key.key, startPeriod: String(year - 4) });
    if (!raw.length) throw new Error('ERP returned no rows');
    const region = regionDim(raw);
    const picked = pickMembers(
      raw.filter((r) => /^2\d{8}$/.test(r.dims[region].code)),
      [region],
      prefer,
    );
    const rows = picked.rows;
    const chosen = { ...key.chosen, ...picked.chosen };
    const periods = [...new Set(rows.map((r) => r.period))].sort();
    if (periods.length < 2) throw new Error('need at least two years of ERP');
    const [prev, last] = periods.slice(-2);
    const val = new Map<string, { prev?: number; last?: number }>();
    for (const r of rows) {
      if (r.value == null) continue;
      const e = val.get(r.dims[region].code) ?? {};
      if (r.period === prev) e.prev = r.value;
      if (r.period === last) e.last = r.value;
      val.set(r.dims[region].code, e);
    }
    const map = apportionment();
    const out = [];
    for (const [sal, parts] of map) {
      // Weight each SA2's growth rate by how much of the suburb it covers.
      let w = 0;
      let g = 0;
      for (const p of parts) {
        const e = val.get(p.sa2);
        if (!e?.prev || !e.last) continue;
        g += ((e.last - e.prev) / e.prev) * 100 * p.salShare;
        w += p.salShare;
      }
      if (w > 0.5) out.push({ SAL_CODE_2021: sal, pop_growth_pct: (g / w).toFixed(2), as_at: periodToDate(last) });
    }
    if (out.length < 100) throw new Error(`only ${out.length} suburbs with population growth`);
    writeCsv('population-sal.csv', out);
    return { asAt: periodToDate(last), url: 'https://data.api.abs.gov.au/rest/data/ABS,ABS_ANNUAL_ERP_ASGS2021', rows: out.length, files: ['population-sal.csv'], message: `${prev} to ${last}; ${JSON.stringify(chosen)}` };
  },
};
