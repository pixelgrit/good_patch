/**
 * Victorian Government market data, found through the DataVic catalogue so new
 * releases are picked up automatically:
 *  - Valuer-General Victoria median house and unit prices by suburb (quarterly, plus yearly time series)
 *  - Homes Victoria Rental Report, moving annual median rents by suburb (quarterly)
 */
import { latestResource, resources, type CkanResource } from '../lib/ckan';
import { cache, suburbKey, writeCsv, writeJson } from '../lib/common';
import { download } from '../lib/http';
import { parseRentSheet, parseVgvQuarterly, parseVgvTimeSeries, periodEnd, readWorkbook, type RentSeries } from '../lib/sheet';
import type { Fetcher } from './types';

const VGV = {
  houseQuarter: 'victorian-property-sales-report-median-house-by-suburb',
  unitQuarter: 'victorian-property-sales-report-median-unit-by-suburb',
  houseSeries: 'victorian-property-sales-report-median-house-by-suburb-time-series',
  unitSeries: 'victorian-property-sales-report-median-unit-by-suburb-time-series',
  landQuarter: 'victorian-property-sales-report-median-vacant-land-by-suburb',
  landSeries: 'victorian-property-sales-report-median-vacant-land-by-suburb-time-series',
};

const DATASETS = {
  houses: { quarter: VGV.houseQuarter, series: VGV.houseSeries, minRows: 200 },
  units: { quarter: VGV.unitQuarter, series: VGV.unitSeries, minRows: 200 },
  // Fewer suburbs sell vacant land, and it's optional: a failure here doesn't block houses and units.
  land: { quarter: VGV.landQuarter, series: VGV.landSeries, minRows: 80 },
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

async function fetchResource(res: CkanResource, file: string) {
  const ext = res.url.toLowerCase().includes('.xlsx') || res.format.toLowerCase() === 'xlsx' ? 'xlsx' : 'xls';
  const p = await download(res.url, cache(`${file}.${ext}`), { headers: VGV_HEADERS, archiveFallback: true });
  return { res, sheets: readWorkbook(p) };
}

async function fetchSheets(dataset: string, file: string) {
  return fetchResource(await latestResource(dataset, ['xls', 'xlsx']), file);
}

/** Newest release that can be downloaded (directly or via the archive), trying up to three. */
async function fetchNewestAvailable(dataset: string, file: string) {
  const list = (await resources(dataset, ['xls', 'xlsx'])).slice(0, 3);
  let lastErr: unknown;
  for (const res of list) {
    try {
      return await fetchResource(res, file);
    } catch (err) {
      lastErr = err;
      console.warn(`  ${res.name}: ${(err as Error).message}`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`no downloadable release in ${dataset}`);
}

export const vgvPrices: Fetcher = {
  id: 'vgv',
  name: 'Valuer-General Victoria median prices by suburb',
  cadence: 'quarterly',
  // 2: adds vacant land.
  version: 2,
  async run() {
    const out: Record<string, string | number | null>[] = [];
    const series: Record<string, Record<string, { t: string; v: number }[]>> = {};
    const notes: string[] = [];
    let asAt = '';
    for (const type of ['houses', 'units', 'land'] as const) {
      const ds = DATASETS[type];
      let q: Awaited<ReturnType<typeof fetchSheets>>;
      let quarter: ReturnType<typeof parseVgvQuarterly>;
      try {
        q = await fetchSheets(ds.quarter, `vgv-${type}-quarter`);
        quarter = parseVgvQuarterly(q.sheets, ds.minRows);
      } catch (err) {
        if (type !== 'land') throw err;
        notes.push(`land unavailable: ${(err as Error).message}`);
        continue;
      }
      const qAsAt = periodEnd(q.res.name) ?? periodEnd(quarter.detail) ?? '';
      if (type !== 'land') asAt = asAt && asAt < qAsAt ? asAt : qAsAt || asAt;
      notes.push(`${type} quarter: ${q.res.name} (${quarter.detail})`);

      // The yearly series gives 3, 5 and 10-year growth. It's optional: if no
      // release can be fetched, quarterly prices and 1-year growth still load.
      let tsByKey = new Map<string, { years: Record<number, number> }>();
      try {
        const t = await fetchNewestAvailable(ds.series, `vgv-${type}-series`);
        const ts = parseVgvTimeSeries(t.sheets, ds.minRows);
        notes.push(`${type} series: ${t.res.name} (${ts.detail})`);
        tsByKey = new Map(ts.rows.map((r) => [r.key, r]));
      } catch (err) {
        notes.push(`${type} series unavailable: ${(err as Error).message}`);
      }

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
          median_quarter_year_ago: r.yearAgo ?? '',
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

/** Optional: 2-bedroom house rents, blended into unit rents where townhouses are common. */
const TOWNHOUSE_SHEET = /2\s*b(ed)?r?(oo)?m?\w*\s*house/i;

export const homesVicRents: Fetcher = {
  id: 'homesvic',
  name: 'Homes Victoria Rental Report, moving annual rents by suburb',
  cadence: 'quarterly',
  // 2: adds 2-bedroom house rents.
  version: 2,
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
    const th = sheets.find((s) => TOWNHOUSE_SHEET.test(s.name));
    if (th) {
      try {
        const { series: groups, detail } = parseRentSheet(th);
        notes.push(`2-bed houses: ${detail}`);
        for (const g of groups) {
          const last = g.points[g.points.length - 1];
          for (const member of g.group.split(/\s*[-–\/]\s*|\s+&\s+/)) {
            const key = suburbKey(member);
            if (key) rows.push({ suburb_group: g.group, suburb: member, key, type: 'house2', median_rent: last.v, median_rent_1y_ago: '', median_rent_3y_ago: '', as_at: last.t });
          }
        }
      } catch (err) {
        notes.push(`2-bed houses unavailable: ${(err as Error).message}`);
      }
    }
    writeCsv('homesvic-rents.csv', rows);
    writeJson('homesvic-series.json', series);
    return { asAt, url: res.url, rows: rows.length, files: ['homesvic-rents.csv', 'homesvic-series.json'], message: `${res.name}; ${notes.join('; ')}` };
  },
};
