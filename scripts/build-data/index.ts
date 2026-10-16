/**
 * Build the static data the app loads from public/data/.
 *
 *   npm run data            real figures from data/real/ plus any source files in data/raw/
 *   npm run data:mock       the old mock seed, for testing the UI without real data
 *   flags: --all-vic        keep every Victorian SAL, not just metro Melbourne
 */
import fs from 'node:fs';
import path from 'node:path';
import * as turf from '@turf/turf';
import type { Feature } from 'geojson';
import { applyPercentiles } from '../../src/lib/scoring';
import type { Dataset } from '../../src/lib/types';
import { emptySuburb, OUT_DIR, round, SOURCES_DIR, type BuildContext } from './context';
import { licensedAdapters } from './adapters/licensed';
import { mockBoundaries, mockMetrics, mockTransport } from './adapters/mock';
import { curatedCensus, curatedMarket, curatedSeifa } from './adapters/curated';
import { absApprovals, absCensus, absPopulation, absSal, absSeifa, dtpTransport, homesVicRents, suburbsFromBoundaries, vgvMedians, vicmapPlanning } from './adapters/open';
import type { Adapter } from './adapters/types';
import { applyDerived, applyGeo, tramCatchments, vicMask } from './lib/geo';
import { VIC_OUTLINE } from './mock/transport.seed';

const args = new Set(process.argv.slice(2));
const mockOnly = args.has('--mock-only');

// Order matters: official geometry runs before the approximate fallback in the
// boundaries/transport stages; in the metrics stage later adapters overwrite earlier ones.
const ADAPTERS: Adapter[] = mockOnly
  ? [mockBoundaries, mockTransport, mockMetrics]
  : [
      absSal,
      mockBoundaries,
      dtpTransport,
      mockTransport,
      curatedMarket,
      curatedCensus,
      curatedSeifa,
      vgvMedians,
      homesVicRents,
      absCensus,
      absSeifa,
      absApprovals,
      absPopulation,
      vicmapPlanning,
      ...licensedAdapters,
    ];

async function main() {
  loadDotEnv();
  const t0 = Date.now();
  const ctx: BuildContext = {
    args,
    boundaries: [],
    transport: null,
    suburbs: [],
    byCode: new Map(),
    usedMock: false,
    approxGeometry: false,
    log: (m) => console.log(m),
  };

  let suburbsMade = false;
  for (const a of ADAPTERS) {
    if (a.stage === 'metrics' && !suburbsMade) {
      suburbsFromBoundaries(ctx, emptySuburb);
      suburbsMade = true;
    }
    const ok = a.available(ctx);
    if (ok !== true) {
      console.log(`- ${a.name}: skipped (${ok})`);
      continue;
    }
    console.log(`- ${a.name}`);
    try {
      await a.run(ctx);
    } catch (err) {
      console.warn(`  warning: ${(err as Error).message}`);
    }
  }

  // Keep suburbs with a median price for houses or units: without one there's
  // no yield, and comparing them against priced suburbs would mislead.
  const before = ctx.suburbs.length;
  ctx.suburbs = ctx.suburbs.filter((s) => s.houses.metrics.medianPrice?.value != null || s.units.metrics.medianPrice?.value != null);
  ctx.byCode = new Map(ctx.suburbs.map((s) => [s.code, s]));
  ctx.boundaries = ctx.boundaries.filter((b) => ctx.byCode.has(b.properties.code));
  if (before !== ctx.suburbs.length) console.log(`- kept ${ctx.suburbs.length} of ${before} suburbs with a median price`);

  console.log('- tram catchments and access');
  const catchments = ctx.transport ? tramCatchments(ctx.transport.tramStops) : { c400: null, c800: null };
  applyGeo(ctx, catchments);

  console.log('- derived metrics and percentiles');
  applyDerived(ctx);
  applyPercentiles(ctx.suburbs);

  // Write outputs
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifestPath = path.join(SOURCES_DIR, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? (JSON.parse(fs.readFileSync(manifestPath, 'utf8')).sources as Record<string, { id: string; name: string; status: string; asAt?: string; fetchedAt: string }>) : {};
  const sources = Object.values(manifest).map(({ id, name, status, asAt, fetchedAt }) => ({ id, name, status, asAt, fetchedAt }));
  const dataset: Dataset = { generatedAt: new Date().toISOString(), mock: ctx.usedMock, approxGeometry: ctx.approxGeometry, sources, suburbs: ctx.suburbs };
  write('suburbs.json', dataset);
  write('suburbs.geojson', turf.featureCollection(ctx.boundaries.map((b) => ({ ...b, properties: { code: b.properties.code, name: b.properties.name } }))));
  write('suburb-labels.geojson', turf.featureCollection(ctx.suburbs.map((s) => turf.point(s.centroid, { code: s.code, name: s.name }))));
  if (ctx.transport) {
    write('tram-lines.geojson', ctx.transport.tramLines);
    write('tram-stops.geojson', ctx.transport.tramStops);
    write('train-lines.geojson', ctx.transport.trainLines);
    write('train-stations.geojson', ctx.transport.trainStations);
    const bands: Feature[] = [];
    if (catchments.c800) bands.push({ ...roundFeature(catchments.c800), properties: { band: 800 } });
    if (catchments.c400) bands.push({ ...roundFeature(catchments.c400), properties: { band: 400 } });
    write('tram-catchment.geojson', turf.featureCollection(bands));
  }
  write('vic-mask.geojson', turf.featureCollection([vicMask(VIC_OUTLINE)]));

  console.log(`\nWrote ${ctx.suburbs.length} suburbs to public/data in ${((Date.now() - t0) / 1000).toFixed(1)}s${ctx.usedMock ? ' (includes mock data)' : ''}.`);
}

function write(file: string, data: unknown) {
  const p = path.join(OUT_DIR, file);
  fs.writeFileSync(p, JSON.stringify(data));
  console.log(`  ${file.padEnd(24)} ${(fs.statSync(p).size / 1024).toFixed(0).padStart(6)} KB`);
}

function roundFeature<T extends Feature>(f: T): T {
  const walk = (c: unknown): unknown => (typeof c === 'number' ? round(c, 5) : Array.isArray(c) ? c.map(walk) : c);
  return { ...f, geometry: { ...f.geometry, coordinates: walk((f.geometry as { coordinates: unknown }).coordinates) } } as T;
}

function loadDotEnv() {
  for (const file of ['.env', '.env.local']) {
    const p = path.resolve(file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
