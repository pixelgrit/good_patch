/**
 * Reserve Bank of Australia housing lending rates (table F6), for "rent cover":
 * how much of the interest on a loan the rent pays. The investor variable rate
 * on new loans is preferred; columns are found by their titles.
 */
import fs from 'node:fs';
import { cache, writeJson } from '../lib/common';
import { download } from '../lib/http';
import type { Fetcher } from './types';

const F6 = 'https://www.rba.gov.au/statistics/tables/csv/f6-data.csv';

/** Minimal CSV line split that respects quotes. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Column preference, best first: every pattern must match the column title. */
const PREFER: RegExp[][] = [
  [/investor/i, /variable/i, /new/i],
  [/investor/i, /variable/i],
  [/variable/i, /new/i],
  [/variable/i],
];

export function parseF6(text: string): { rate: number; title: string; date: string } {
  const lines = text.split(/\r?\n/).map(splitCsv);
  const titleRow = lines.find((r) => /^title$/i.test(r[0]));
  if (!titleRow) throw new Error('F6: no Title row');
  const data = lines.filter((r) => /^\d{1,2}[-/][A-Za-z0-9]{2,3}[-/]\d{2,4}$/.test(r[0]) || /^\d{4}-\d{2}(-\d{2})?$/.test(r[0]));
  for (const pats of PREFER) {
    const col = titleRow.findIndex((t, i) => i > 0 && pats.every((p) => p.test(t)));
    if (col < 0) continue;
    for (let i = data.length - 1; i >= 0; i--) {
      const v = Number(data[i][col]);
      if (Number.isFinite(v) && v > 1 && v < 20) return { rate: v, title: titleRow[col], date: data[i][0] };
    }
  }
  throw new Error(`F6: no variable-rate column among ${titleRow.slice(1, 12).join(' | ')}`);
}

export const rbaRates: Fetcher = {
  id: 'rba-rates',
  name: 'RBA housing lending rates (F6)',
  cadence: 'monthly',
  async run() {
    const p = await download(F6, cache('rba-f6.csv'));
    const { rate, title, date } = parseF6(fs.readFileSync(p, 'latin1'));
    writeJson('rba-rate.json', { rate, title, date });
    return { asAt: date, url: F6, rows: 1, files: ['rba-rate.json'], message: `${rate}% (${title})` };
  },
};
