/**
 * Download and normalise every free source into data/sources/.
 *
 *   npm run fetch                 every source that is due
 *   npm run fetch -- --all        ignore cadence, refetch everything
 *   npm run fetch -- --only=vgv,homesvic
 *
 * A source that fails keeps its previous output, so one broken release never
 * wipes good data. The run exits 1 if anything failed, after writing
 * data/sources/manifest.json, so a scheduled job can report it.
 */
import fs from 'node:fs';
import { out, type ManifestEntry } from './lib/common';
import { describe } from './lib/http';
import { absBoundaries, absSeifa } from './sources/abs-geo';
import { absApprovals, absCensus, absPopulation } from './sources/abs-stats';
import { homesVicRents, vgvPrices } from './sources/vic-market';
import { ptvGtfs, vicmapAdmin, vicmapPlanning } from './sources/vic-spatial';
import type { Cadence, Fetcher } from './sources/types';
import { wikipedia } from './sources/wikipedia';

const FETCHERS: Fetcher[] = [absBoundaries, vicmapAdmin, absSeifa, absCensus, vgvPrices, homesVicRents, absApprovals, absPopulation, vicmapPlanning, ptvGtfs, wikipedia];

/** Refetch when the last success is older than this many days. */
const DUE_AFTER_DAYS: Record<Cadence, number> = { weekly: 6, monthly: 25, quarterly: 25, yearly: 60, static: Infinity };

const args = process.argv.slice(2);
const all = args.includes('--all');
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');

async function main() {
  const manifestPath = out('manifest.json');
  const previous: Record<string, ManifestEntry> = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')).sources ?? {} : {};
  const results: Record<string, ManifestEntry> = { ...previous };
  const failedIds = new Set<string>();
  /** Sources fetched in this run: anything that depends on one refetches too. */
  const refreshedIds = new Set<string>();
  let failures = 0;

  for (const f of FETCHERS) {
    if (only && !only.includes(f.id)) continue;
    const prev = previous[f.id];
    const outputsExist = prev?.files?.every((file) => fs.existsSync(out(file)));
    const age = prev?.status === 'ok' ? (Date.now() - Date.parse(prev.fetchedAt)) / 86_400_000 : Infinity;
    const sameVersion = (prev?.version ?? 1) === (f.version ?? 1);
    const inputsChanged = f.needs?.some((n) => refreshedIds.has(n)) ?? false;
    if (!all && !only && outputsExist && sameVersion && !inputsChanged && age < DUE_AFTER_DAYS[f.cadence]) {
      console.log(`- ${f.name}: up to date (${prev!.asAt ?? 'fetched ' + prev!.fetchedAt.slice(0, 10)})`);
      continue;
    }
    if (f.localOnly && process.env.GITHUB_ACTIONS && !only?.includes(f.id)) {
      console.log(`- ${f.name}: skipped on GitHub Actions. ${f.localOnly}`);
      results[f.id] = prev?.status === 'ok' ? { ...prev, message: `Last fetched locally. ${f.localOnly}` } : { id: f.id, name: f.name, status: 'skipped', fetchedAt: prev?.fetchedAt ?? new Date().toISOString(), message: f.localOnly };
      continue;
    }
    if (f.needs?.some((n) => failedIds.has(n))) {
      console.log(`- ${f.name}: skipped, depends on a failed source`);
      continue;
    }
    console.log(`- ${f.name}`);
    const t0 = Date.now();
    try {
      const r = await f.run();
      results[f.id] = { id: f.id, name: f.name, status: 'ok', fetchedAt: new Date().toISOString(), ...r, ...(f.version ? { version: f.version } : {}) };
      refreshedIds.add(f.id);
      console.log(`  ok in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${r.rows ?? 0} rows, as at ${r.asAt ?? '—'}${r.message ? ` (${r.message})` : ''}`);
    } catch (err) {
      failures++;
      failedIds.add(f.id);
      const message = describe(err);
      // Keep the last good result's files and date; record the failure.
      results[f.id] = { ...(prev ?? { id: f.id, name: f.name, fetchedAt: new Date().toISOString() }), status: 'failed', message, id: f.id, name: f.name };
      console.error(`  FAILED: ${message}`);
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify({ updatedAt: new Date().toISOString(), sources: results }, null, 2));
  writeSummary(results);
  if (failures) {
    console.error(`\n${failures} source(s) failed. Previous data for them was kept.`);
    process.exit(1);
  }
}

function writeSummary(results: Record<string, ManifestEntry>) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const lines = ['| Source | Status | As at | Rows | Note |', '| --- | --- | --- | --- | --- |'];
  for (const r of Object.values(results)) lines.push(`| ${r.name} | ${r.status} | ${r.asAt ?? ''} | ${r.rows ?? ''} | ${(r.message ?? '').replace(/\|/g, '/').slice(0, 160)} |`);
  fs.appendFileSync(file, `## Data refresh\n\n${lines.join('\n')}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
