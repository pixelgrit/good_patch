/**
 * Victorian Government market data, found through the DataVic catalogue so new
 * releases are picked up automatically:
 *  - Valuer-General Victoria median house and unit prices by suburb (quarterly, plus yearly time series)
 *  - Homes Victoria Rental Report, moving annual median rents by suburb (quarterly)
 */
import { latestResource } from '../lib/ckan';
import { cache, suburbKey, writeCsv, writeJson } from '../lib/common';
import { download } from '../lib/http';
import { parseRentSheet, parseVgvQuarterly, parseVgvTimeSeries, periodEnd, readWorkbook, type RentSeries } from '../lib/sheet';
import type { Fetcher } from './types';

const VGV = {
  houseQuarter: 'victorian-property-sales-report-median-house-by-suburb',
  unitQuarter: 'victorian-property-sales-report-median-unit-by-suburb',
  houseSeries: 'victorian-property-sales-report-median-house-by-suburb-time-series',
  unitSeries: 'victorian-property-sales-report-median-unit-by-suburb-time-series',
};

/** land.vic.gov.au's firewall rejects bare requests; send what a browser following the report page's link would. */
const VGV_HEADERS = {
  Accept: 'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/html;q=0.9,*/*;q=0.8',
  Referer: 'https://www.land.vic.gov.au/valuations/resources-and-reports/property-sales-statistics',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Upgrade-Insecure-Requests': '1',
};

async function fetchSheets(dataset: string, file: string) {
  const res = await latestResource(dataset, ['xls', 'xlsx']);
  const ext = res.url.toLowerCase().includes('.xlsx') || res.format.toLowerCase() === 'xlsx' ? 'xlsx' : 'xls';
  const p = await download(res.url, cache(`${file}.${ext}`), { headers: VGV_HEADERS, archiveFallback: true });
  return { res, sheets: readWorkbook(p) };
}

export const vgvPrices: Fetcher = {
  id: 'vgv',
  name: 'Valuer-General Victoria median prices by suburb',
  cadence: 'quarterly',
  async run() {
    const out: Record<string, string | number | null>[] = [];
    const series: Record<string, Record<string, { t: string; v: number }[]>> = {};
    const notes: string[] = [];
    let asAt = '';
    for (const type of ['houses', 'units'] as const) {
      const q = await fetchSheets(type === 'houses' ? VGV.houseQuarter : VGV.unitQuarter, `vgv-${type}-quarter`);
      const quarter = parseVgvQuarterly(q.sheets);
      const qAsAt = periodEnd(q.res.name) ?? periodEnd(quarter.detail) ?? '';
      asAt = asAt && asAt < qAsAt ? asAt : qAsAt || asAt;
      notes.push(`${type} quarter: ${q.res.name} (${quarter.detail})`);

      const t = await fetchSheets(type === 'houses' ? VGV.houseSeries : VGV.unitSeries, `vgv-${type}-series`);
      const ts = parseVgvTimeSeries(t.sheets);
      notes.push(`${type} series: ${t.res.name} (${ts.detail})`);
      const tsByKey = new Map(ts.rows.map((r) => [r.key, r]));

      for (const r of quarter.rows) {
        const s = tsByKey.get(r.key);
        const years = s ? Object.keys(s.years).map(Number).sort((a, b) => a - b) : [];
        const last = years[years.length - 1];
        const ago = (n: number) => (s && s.years[last - n] ? s.years[last - n] : '');
        out.push({
          suburb: r.suburb,
          key: r.key,
          type,
          median: r.median,
          sales: r.sales ?? '',
          period_end: qAsAt,
          series_last_year: last ?? '',
          median_last_year: s && last ? s.years[last] : '',
          median_1y_ago: ago(1),
          median_3y_ago: ago(3),
          median_5y_ago: ago(5),
          median_10y_ago: ago(10),
        });
        if (s) (series[r.key] ??= {})[type] = years.map((y) => ({ t: `${y}-12-31`, v: s.years[y] }));
      }
    }
    writeCsv('vgv-medians.csv', out);
    writeJson('vgv-series.json', series);
    return { asAt, url: 'https://discover.data.vic.gov.au/dataset/victorian-property-sales-report-median-house-by-suburb', rows: out.length, files: ['vgv-medians.csv', 'vgv-series.json'], message: notes.join('; ') };
  },
};

const RENT_DATASET = 'rental-report-quarterly-moving-annual-rents-by-suburb';

/** Benchmarks for each property type: the most common investor stock. */
const RENT_SHEETS: Record<'houses' | 'units', RegExp[]> = {
  houses: [/3\s*b(ed)?r?(oo)?m?\w*\s*house/i, /house/i],
  units: [/2\s*b(ed)?r?(oo)?m?\w*\s*flat/i, /flat|unit/i],
};

export const homesVicRents: Fetcher = {
  id: 'homesvic',
  name: 'Homes Victoria Rental Report, moving annual rents by suburb',
  cadence: 'quarterly',
  async run() {
    const res = await latestResource(RENT_DATASET, ['xlsx', 'xls']);
    const sheets = readWorkbook(await download(res.url, cache('homesvic-rents.xlsx')));
    const rows: Record<string, string | number>[] = [];
    const series: Record<string, Record<string, { t: string; v: number }[]>> = {};
    const notes: string[] = [];
    let asAt = '';
    for (const type of ['houses', 'units'] as const) {
      const sheet = RENT_SHEETS[type].map((p) => sheets.find((s) => p.test(s.name))).find(Boolean);
      if (!sheet) throw new Error(`no ${type} sheet among ${sheets.map((s) => s.name).join(', ')}`);
      const { series: groups, detail } = parseRentSheet(sheet);
      notes.push(`${type}: ${detail}`);
      for (const g of groups as RentSeries[]) {
        const pts = g.points;
        const last = pts[pts.length - 1];
        const back = (q: number) => pts[pts.length - 1 - q]?.v ?? '';
        asAt = last.t > asAt ? last.t : asAt;
        // Groups like "Carlton-Parkville" apply to each member suburb.
        for (const member of g.group.split(/\s*[-–\/]\s*|\s+&\s+/)) {
          const key = suburbKey(member);
          if (!key) continue;
          rows.push({ suburb_group: g.group, suburb: member, key, type, median_rent: last.v, median_rent_1y_ago: back(4), median_rent_3y_ago: back(12), as_at: last.t });
          (series[key] ??= {})[type] = pts.slice(-21);
        }
      }
    }
    writeCsv('homesvic-rents.csv', rows);
    writeJson('homesvic-series.json', series);
    return { asAt, url: res.url, rows: rows.length, files: ['homesvic-rents.csv', 'homesvic-series.json'], message: `${res.name}; ${notes.join('; ')}` };
  },
};
