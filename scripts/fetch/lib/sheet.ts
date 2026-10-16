/**
 * Layout-tolerant spreadsheet readers for the Valuer-General and Homes Victoria
 * workbooks. Government spreadsheets move columns and header rows between
 * releases, so columns are found by their header text, not their position, and
 * every parser checks its output and throws rather than writing doubtful data.
 */
import XLSX from 'xlsx';
import { parseNumber, suburbKey } from './common';

export type Grid = (string | number | null)[][];

export interface Sheet {
  name: string;
  grid: Grid;
}

export function readWorkbook(file: string): Sheet[] {
  const wb = XLSX.readFile(file, { cellDates: false });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    // raw:false gives the displayed text, so dates read as "Mar 2025" rather than serial numbers.
    const grid = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, raw: false, defval: null, blankrows: false });
    return { name, grid: grid.map((r) => r.map((c) => (c == null ? null : String(c).trim() || null))) };
  });
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Mar 2025", "Mar-25", "March quarter 2025", "Jan - Mar 2025" -> ISO end-of-month date, or null. */
export function periodEnd(label: string | null | undefined): string | null {
  if (!label) return null;
  const s = String(label).toLowerCase();
  const year = s.match(/\b(19|20)\d{2}\b/)?.[0] ?? (s.match(/[-\s'](\d{2})\b/) ? `20${s.match(/[-\s'](\d{2})\b/)![1]}` : null);
  if (!year) return null;
  // Take the last month name mentioned ("Jan - Mar 2025" -> Mar).
  let month = -1;
  for (let i = 0; i < MONTHS.length; i++) {
    const idx = s.lastIndexOf(MONTHS[i]);
    if (idx >= 0 && (month < 0 || idx > s.lastIndexOf(MONTHS[month]))) month = i;
  }
  if (month < 0) return null;
  const d = new Date(Date.UTC(Number(year), month + 1, 0));
  return d.toISOString().slice(0, 10);
}

/** Header text for a column: the cells above the data start, joined (handles merged/two-row headers). */
function columnHeader(grid: Grid, headerRow: number, col: number, depth = 3): string {
  const parts: string[] = [];
  for (let r = Math.max(0, headerRow - depth + 1); r <= headerRow; r++) {
    // Merged header cells only fill their first column; carry the last non-empty value leftwards.
    let v = grid[r]?.[col] ?? null;
    if (v == null && r < headerRow) {
      for (let c = col - 1; c >= Math.max(0, col - 2); c--) {
        if (grid[r]?.[c] != null) {
          v = grid[r][c];
          break;
        }
      }
    }
    if (v != null) parts.push(String(v));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/* Valuer-General quarterly median by suburb                            */
/* ------------------------------------------------------------------ */

export interface VgvQuarterRow {
  suburb: string;
  key: string;
  median: number;
  sales: number | null;
}

export function parseVgvQuarterly(sheets: Sheet[]): { rows: VgvQuarterRow[]; detail: string } {
  for (const { name, grid } of sheets) {
    const hr = grid.findIndex((row) => row.some((c) => c != null && /^(suburb|locality)/i.test(String(c))));
    if (hr < 0) continue;
    const suburbCol = grid[hr].findIndex((c) => c != null && /^(suburb|locality)/i.test(String(c)));
    const width = Math.max(...grid.slice(hr, hr + 50).map((r) => r.length));
    const cols = Array.from({ length: width }, (_, c) => ({ c, h: columnHeader(grid, hr, c) })).filter(({ c }) => c !== suburbCol);
    const isChange = (h: string) => /change|%|chg|growth/i.test(h);
    const isSales = (h: string) => /sales|no\.|number|count/i.test(h);
    const data = grid.slice(hr + 1).filter((r) => typeof r[suburbCol] === 'string' && /[A-Za-z]/.test(String(r[suburbCol])) && !/total|victoria|metropolitan|country|^source/i.test(String(r[suburbCol])));
    const numericShare = (c: number, min: number) => data.filter((r) => (parseNumber(r[c]) ?? 0) > min).length / Math.max(1, data.length);
    const medianCols = cols.filter(({ c, h }) => !isChange(h) && !isSales(h) && numericShare(c, 50_000) > 0.4);
    const salesCols = cols.filter(({ c, h }) => isSales(h) && numericShare(c, -1) > 0.3);
    if (!medianCols.length) continue;
    const latest = medianCols[medianCols.length - 1];
    const sales = salesCols.length ? salesCols[salesCols.length - 1] : null;
    const rows: VgvQuarterRow[] = [];
    for (const r of data) {
      const median = parseNumber(r[latest.c]);
      if (median == null || median < 50_000) continue;
      const suburb = String(r[suburbCol]);
      rows.push({ suburb, key: suburbKey(suburb), median, sales: sales ? parseNumber(r[sales.c]) : null });
    }
    if (rows.length < 200) throw new Error(`VGV quarterly: only ${rows.length} suburbs parsed on sheet "${name}"`);
    return { rows, detail: `sheet "${name}", suburb col ${suburbCol}, median col "${latest.h}"${sales ? `, sales col "${sales.h}"` : ''}` };
  }
  throw new Error('VGV quarterly: no sheet with a Suburb/Locality header and price columns');
}

/* ------------------------------------------------------------------ */
/* Valuer-General yearly time series by suburb                          */
/* ------------------------------------------------------------------ */

export interface VgvSeriesRow {
  suburb: string;
  key: string;
  /** year -> median */
  years: Record<number, number>;
}

export function parseVgvTimeSeries(sheets: Sheet[]): { rows: VgvSeriesRow[]; detail: string } {
  for (const { name, grid } of sheets) {
    const hr = grid.findIndex((row) => row.filter((c) => c != null && /^(19|20)\d{2}\b/.test(String(c))).length >= 5);
    if (hr < 0) continue;
    const yearCols = grid[hr].map((c, i) => ({ i, y: c != null ? Number(String(c).match(/^((19|20)\d{2})\b/)?.[1]) : NaN })).filter(({ y }) => Number.isFinite(y));
    // Suburb column: the text column left of the first year with the most text values.
    const first = yearCols[0].i;
    const body = grid.slice(hr + 1);
    let suburbCol = -1;
    let best = 0;
    for (let c = 0; c < first; c++) {
      const n = body.filter((r) => typeof r[c] === 'string' && /[A-Za-z]{3}/.test(String(r[c])) && parseNumber(r[c]) == null).length;
      if (n > best) {
        best = n;
        suburbCol = c;
      }
    }
    if (suburbCol < 0) continue;
    const rows: VgvSeriesRow[] = [];
    for (const r of body) {
      const suburb = r[suburbCol];
      if (typeof suburb !== 'string' || /total|victoria|metropolitan|country|^source/i.test(suburb)) continue;
      const years: Record<number, number> = {};
      for (const { i, y } of yearCols) {
        const v = parseNumber(r[i]);
        if (v != null && v > 50_000) years[y] = v;
      }
      if (Object.keys(years).length >= 3) rows.push({ suburb, key: suburbKey(suburb), years });
    }
    if (rows.length < 200) throw new Error(`VGV time series: only ${rows.length} suburbs parsed on sheet "${name}"`);
    return { rows, detail: `sheet "${name}", years ${yearCols[0].y}–${yearCols[yearCols.length - 1].y}` };
  }
  throw new Error('VGV time series: no sheet with a row of year headers');
}

/* ------------------------------------------------------------------ */
/* Homes Victoria moving annual rents by suburb                         */
/* ------------------------------------------------------------------ */

export interface RentSeries {
  group: string;
  points: { t: string; v: number }[];
}

/**
 * Each sheet is one dwelling type. A header row holds quarter labels, often
 * with a "Count | Median" row beneath; suburb groups sit in a text column on the left.
 */
export function parseRentSheet(sheet: Sheet): { series: RentSeries[]; detail: string } {
  const { grid, name } = sheet;
  const hr = grid.findIndex((row) => row.filter((c) => periodEnd(c as string) != null).length >= 8);
  if (hr < 0) throw new Error(`rent sheet "${name}": no row of quarter labels`);
  const sub = grid[hr + 1] ?? [];
  const hasSub = sub.some((c) => c != null && /median/i.test(String(c)));
  const quarters: { col: number; t: string }[] = [];
  grid[hr].forEach((c, i) => {
    const t = periodEnd(c as string);
    if (!t) return;
    let col = i;
    if (hasSub) {
      // The median sits under this label or the next column.
      if (sub[i] != null && /median/i.test(String(sub[i]))) col = i;
      else if (sub[i + 1] != null && /median/i.test(String(sub[i + 1]))) col = i + 1;
      else return;
    }
    quarters.push({ col, t });
  });
  if (quarters.length < 8) throw new Error(`rent sheet "${name}": found ${quarters.length} quarters`);
  const start = hr + (hasSub ? 2 : 1);
  const body = grid.slice(start);
  const firstData = Math.min(...quarters.map((q) => q.col));
  // Suburb-group column: rightmost text column before the data.
  let groupCol = -1;
  for (let c = firstData - 1; c >= 0; c--) {
    const n = body.filter((r) => typeof r[c] === 'string' && /[A-Za-z]{3}/.test(String(r[c]))).length;
    if (n > body.length * 0.5) {
      groupCol = c;
      break;
    }
  }
  if (groupCol < 0) throw new Error(`rent sheet "${name}": no suburb column`);
  const series: RentSeries[] = [];
  for (const r of body) {
    const group = r[groupCol];
    if (typeof group !== 'string' || /total|group total|victoria|metro|^source/i.test(group)) continue;
    const points = quarters
      .map(({ col, t }) => ({ t, v: parseNumber(r[col]) }))
      .filter((p): p is { t: string; v: number } => p.v != null && p.v > 50 && p.v < 10_000);
    if (points.length >= 4) series.push({ group, points });
  }
  if (series.length < 50) throw new Error(`rent sheet "${name}": only ${series.length} suburb groups`);
  return { series, detail: `sheet "${name}", ${quarters.length} quarters to ${quarters[quarters.length - 1].t}, ${series.length} groups` };
}
