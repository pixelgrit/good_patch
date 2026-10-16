/**
 * Parser self-test against synthetic workbooks shaped like the published files.
 * Run: npm run test:fetch
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';
import { parseSdmxCsv, pickMembers } from '../lib/sdmx';
import { parseRentSheet, parseVgvQuarterly, parseVgvTimeSeries, periodEnd, readWorkbook } from '../lib/sheet';
import { suburbKey } from '../lib/common';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'propa-test-'));
const names = ['ABBOTSFORD', 'FITZROY', 'ST KILDA EAST', 'CARLTON NORTH', ...Array.from({ length: 300 }, (_, i) => `TESTVILLE ${i}`)];

function book(sheets: Record<string, unknown[][]>, file: string) {
  const wb = XLSX.utils.book_new();
  for (const [n, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n);
  const p = path.join(tmp, file);
  XLSX.writeFile(wb, p);
  return p;
}

// periodEnd
assert.equal(periodEnd('Jan - Mar 2026'), '2026-03-31');
assert.equal(periodEnd('March 2026 Quarter'), '2026-03-31');
assert.equal(periodEnd('Sep 2025'), '2025-09-30');
assert.equal(periodEnd('Dec-24'), '2024-12-31');
assert.equal(periodEnd('March Quarter 2026 Jan - Mar 2025'), '2025-03-31');
assert.equal(suburbKey('East St Kilda'), 'ST KILDA EAST');
assert.equal(suburbKey('Saint Kilda East'), 'ST KILDA EAST');
assert.equal(suburbKey('Fitzroy (Vic.)'), 'FITZROY');
assert.equal(suburbKey('West Melbourne'), 'WEST MELBOURNE');

// VGV quarterly: title rows, two-row header, change columns, totals row
const q = book(
  {
    'Median House': [
      ['Victorian Property Sales Report - Median House by Suburb'],
      ['March Quarter 2026'],
      [],
      ['', 'Jan - Mar 2025', 'Oct - Dec 2025', 'Jan - Mar 2026', 'No of Sales', 'Change', 'Change'],
      ['SUBURB', '', '', '', 'Jan - Mar 2026', 'Quarter %', 'Year %'],
      ...names.map((n, i) => [n, 900000 + i * 1000, 950000 + i * 1000, 1000000 + i * 1000, 20 + (i % 30), '1.2%', '4.5%']),
      ['VICTORIA', 800000, 810000, 820000, 30000, '1%', '2%'],
    ],
  },
  'q.xlsx',
);
const pq = parseVgvQuarterly(readWorkbook(q));
assert.ok(pq.rows.length === names.length, `quarterly rows ${pq.rows.length}`);
const fitz = pq.rows.find((r) => r.key === 'FITZROY')!;
assert.equal(fitz.median, 1001000);
assert.equal(fitz.yearAgo, 901000);
assert.equal(fitz.sales, 21);
console.log('vgv quarterly ok:', pq.detail);

// VGV time series
const t = book(
  {
    Houses: [
      ['Median house price by suburb 2015 - 2025'],
      ['Locality', 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 'Growth 2024-2025', 'CAGR'],
      ...names.map((n, i) => [n, ...Array.from({ length: 11 }, (_, y) => (600000 + i * 1000) * (1 + y * 0.05)), '5%', '4%']),
    ],
  },
  't.xlsx',
);
const pt = parseVgvTimeSeries(readWorkbook(t));
assert.equal(pt.rows.length, names.length);
assert.equal(Object.keys(pt.rows[0].years).length, 11);
console.log('vgv series ok:', pt.detail);

// Homes Victoria rents: region + group columns, quarter labels with Count/Median beneath
const quarters = Array.from({ length: 24 }, (_, i) => {
  const y = 2020 + Math.floor(i / 4);
  return `${['Mar', 'Jun', 'Sep', 'Dec'][i % 4]} ${y}`;
});
const head1: unknown[] = ['', ''];
const head2: unknown[] = ['', ''];
for (const qq of quarters) {
  head1.push(qq, null);
  head2.push('Count', 'Median');
}
const groups = ['Carlton-Parkville', 'Fitzroy', 'Balaclava-St Kilda East', ...Array.from({ length: 80 }, (_, i) => `Group ${i}`)];
const r = book(
  {
    'Contents': [['Moving annual rents by suburb']],
    '3 bedroom house': [['Moving annual median rent'], [], head1, head2, ...groups.map((g, i) => ['Inner Melbourne', g, ...quarters.flatMap((_, k) => [100 + k, `$${600 + i + k * 5}`])]), ['', 'Group Total', ...quarters.flatMap(() => [1, 1])]],
    '2 bedroom flat': [['Moving annual median rent'], [], head1, head2, ...groups.map((g, i) => ['Inner Melbourne', g, ...quarters.flatMap((_, k) => [100 + k, 400 + i + k * 3])])],
  },
  'r.xlsx',
);
const sheets = readWorkbook(r);
const pr = parseRentSheet(sheets.find((s) => /3 bedroom house/.test(s.name))!);
assert.equal(pr.series.length, groups.length);
assert.equal(pr.series[1].points.length, 24);
assert.equal(pr.series[1].points[23].t, '2025-12-31');
assert.equal(pr.series[1].points[23].v, 600 + 1 + 23 * 5);
console.log('rent ok:', pr.detail);

// SDMX CSV with labels
const csv = [
  'DATAFLOW,MEASURE: Measure,BUILDING_TYPE: Type of building,REGION: Region,FREQ: Frequency,TIME_PERIOD: Time Period,OBS_VALUE',
  'ABS:BA_SA2(1.0.0),1: Number of dwelling units,110: Houses,206041122: Fitzroy,M: Monthly,2026-08,3',
  'ABS:BA_SA2(1.0.0),1: Number of dwelling units,100: Total Residential,206041122: Fitzroy,M: Monthly,2026-08,12',
  'ABS:BA_SA2(1.0.0),2: Value of building,100: Total Residential,206041122: Fitzroy,M: Monthly,2026-08,5000',
].join('\n');
const rows = parseSdmxCsv(csv);
assert.equal(rows.length, 3);
const picked = pickMembers(rows, ['REGION'], { MEASURE: [/dwelling/i], BUILDING_TYPE: [/total residential/i] });
assert.equal(picked.rows.length, 1);
assert.equal(picked.rows[0].value, 12);
console.log('sdmx ok:', JSON.stringify(picked.chosen));

console.log('\nAll parser tests passed.');
