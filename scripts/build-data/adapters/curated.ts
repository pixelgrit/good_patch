/**
 * Real figures collected by hand from published pages, stored as plain text in
 * data/real/ so they're easy to check and update:
 *
 *   cotality.txt   Cotality suburb figures via Your Investment Property, 12 months to June 2026
 *   census.txt     ABS Census 2021 QuickStats by suburb (SAL)
 *   seifa.txt      ABS SEIFA 2021 IRSAD decile within Victoria, by SAL
 *   sal-codes.txt  suburb name to ABS SAL 2021 code
 *
 * Each line is pipe-separated; lines starting with # are comments.
 */
import fs from 'node:fs';
import path from 'node:path';
import { findByName, num, ROOT, round, setMetric, type BuildContext } from '../context';
import type { PropertyType } from '../../../src/lib/types';
import type { Adapter } from './types';

const DIR = path.join(ROOT, 'data/real');

/** Medians from fewer sales than this are left out as unreliable. */
export const MIN_SALES = 20;

const COTALITY_AS_AT = '2026-06-30';
const CENSUS_AS_AT = '2021-08-10';

function rows(file: string): string[][] {
  const p = path.join(DIR, file);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('|').map((x) => x.trim()));
}

const val = (x: string | undefined) => (x == null || x === 'NA' ? null : num(x));

/** Suburb name to SAL code, used to give mock boundaries their real ABS codes. */
export function salCodes(): Map<string, string> {
  return new Map(rows('sal-codes.txt').map(([name, code]) => [name, code]));
}

export const curatedMarket: Adapter = {
  id: 'curated-cotality',
  name: 'Cotality suburb figures (data/real/cotality.txt)',
  stage: 'metrics',
  licensed: false,
  available: () => (fs.existsSync(path.join(DIR, 'cotality.txt')) ? true : 'missing data/real/cotality.txt'),
  run(ctx: BuildContext) {
    let n = 0;
    let thin = 0;
    for (const [name, t, price, rent, , dom, sales, growth] of rows('cotality.txt')) {
      const s = findByName(ctx, name);
      if (!s) continue;
      const type: PropertyType = t === 'H' ? 'houses' : 'units';
      const salesN = val(sales);
      const put = (key: string, v: number | null) => setMetric(s, key, v, 'yip', COTALITY_AS_AT, type);
      put('sales12m', salesN);
      if (salesN == null || salesN < MIN_SALES) {
        // Too few sales for a meaningful median: leave the market figures empty.
        thin++;
        for (const k of ['medianPrice', 'medianRent', 'dom', 'growth1y']) put(k, null);
        continue;
      }
      put('medianPrice', val(price));
      put('medianRent', val(rent));
      put('dom', val(dom));
      put('growth1y', val(growth));
      n++;
    }
    ctx.log(`  ${n} suburb and property-type rows joined, ${thin} left out for fewer than ${MIN_SALES} sales`);
  },
};

export const curatedCensus: Adapter = {
  id: 'curated-census',
  name: 'ABS Census 2021 QuickStats (data/real/census.txt)',
  stage: 'metrics',
  licensed: false,
  available: () => (fs.existsSync(path.join(DIR, 'census.txt')) ? true : 'missing data/real/census.txt'),
  run(ctx: BuildContext) {
    let n = 0;
    for (const [name, , dwellings, , , flat, outright, mortgage, rented, income] of rows('census.txt')) {
      const s = findByName(ctx, name);
      if (!s) continue;
      const put = (key: string, v: number | null) => setMetric(s, key, v, 'abs-census', CENSUS_AS_AT);
      const own = (val(outright) ?? 0) + (val(mortgage) ?? 0);
      const rent = val(rented);
      // Owner-occupier share of households whose tenure was stated.
      put('ownerOccupier', rent != null && own > 0 ? round((own / (own + rent)) * 100, 1) : null);
      put('dwellings', val(dwellings));
      const weekly = val(income);
      put('medianIncome', weekly == null ? null : weekly * 52);
      s.renterShare = rent == null ? null : round(rent / 100, 3);
      s.unitShare = val(flat) == null ? null : round(val(flat)! / 100, 3);
      n++;
    }
    ctx.log(`  ${n} suburbs joined`);
  },
};

export const curatedSeifa: Adapter = {
  id: 'curated-seifa',
  name: 'ABS SEIFA 2021 by suburb (data/real/seifa.txt)',
  stage: 'metrics',
  licensed: false,
  available: () => (fs.existsSync(path.join(DIR, 'seifa.txt')) ? true : 'missing data/real/seifa.txt'),
  run(ctx: BuildContext) {
    let n = 0;
    for (const [code, decile] of rows('seifa.txt')) {
      const s = ctx.byCode.get(code);
      if (!s) continue;
      setMetric(s, 'seifa', val(decile), 'abs-seifa', CENSUS_AS_AT);
      n++;
    }
    ctx.log(`  ${n} suburbs joined by SAL code`);
  },
};
