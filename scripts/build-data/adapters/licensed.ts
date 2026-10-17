/**
 * Licensed sources. Each adapter reads its API key from the environment and
 * is skipped when the key is absent, leaving the mock (or previous) values.
 *
 * The request and field mapping for each provider depends on your licence and
 * endpoint, so `fetchRows` is the one function to implement per provider.
 * Return one row per suburb and property type; the adapter does the rest.
 */
import { findByName, setMetric, type BuildContext } from '../context';
import type { PropertyType, SourceId } from '../../../src/lib/types';
import type { Adapter } from './types';

interface LicensedRow {
  suburb: string;
  postcode?: string;
  type: PropertyType | 'all';
  asAt: string;
  values: Partial<Record<string, number | null>>;
}

interface LicensedSpec {
  id: SourceId;
  name: string;
  envKey: string;
  /** Metrics this provider supplies. */
  metrics: string[];
  fetchRows(apiKey: string, ctx: BuildContext): Promise<LicensedRow[]>;
}

function notImplemented(provider: string): never {
  throw new Error(
    `${provider}: API key found, but fetchRows() is a stub. Implement the request for your licence in scripts/build-data/adapters/licensed.ts.`,
  );
}

const SPECS: LicensedSpec[] = [
  {
    id: 'sqm',
    name: 'SQM Research (vacancy, stock on market)',
    envKey: 'SQM_RESEARCH_API_KEY',
    metrics: ['vacancy', 'stockOnMarket', 'supplyTrend'],
    // Vacancy is published by postcode: return type "all" and the suburb's postcode.
    async fetchRows() {
      return notImplemented('SQM Research');
    },
  },
  {
    id: 'cotality',
    name: 'Cotality (days on market, inventory, vendor discount)',
    envKey: 'COTALITY_API_KEY',
    metrics: ['dom', 'domTrend', 'inventoryMonths', 'vendorDiscount'],
    async fetchRows() {
      return notImplemented('Cotality');
    },
  },
  {
    id: 'domain',
    name: 'Domain (auction clearance)',
    envKey: 'DOMAIN_API_KEY',
    metrics: ['clearance'],
    async fetchRows() {
      return notImplemented('Domain');
    },
  },
  {
    id: 'search-interest',
    name: 'Search interest per listing',
    envKey: 'SEARCH_INTEREST_API_KEY',
    metrics: ['searchInterest'],
    async fetchRows() {
      return notImplemented('Search interest');
    },
  },
];

export const licensedAdapters: Adapter[] = SPECS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  stage: 'metrics' as const,
  licensed: true,
  available: () => (process.env[spec.envKey] ? true : `no ${spec.envKey} set`),
  async run(ctx: BuildContext) {
    const rows = await spec.fetchRows(process.env[spec.envKey]!, ctx);
    let n = 0;
    for (const row of rows) {
      const targets = row.postcode ? ctx.suburbs.filter((s) => s.postcode.split(/,\s*/).includes(row.postcode!)) : [findByName(ctx, row.suburb)].filter(Boolean);
      for (const s of targets) {
        if (!s) continue;
        const types: PropertyType[] = row.type === 'all' ? ['houses', 'units'] : [row.type];
        for (const key of spec.metrics) {
          if (!(key in row.values)) continue;
          for (const t of types) setMetric(s, key, row.values[key] ?? null, spec.id, row.asAt, t);
        }
        n++;
      }
    }
    ctx.log(`  ${n} suburb rows joined`);
  },
}));
