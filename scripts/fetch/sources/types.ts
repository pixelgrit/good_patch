import type { ManifestEntry } from '../lib/common';

export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'static';

export interface FetchResult {
  asAt?: string;
  url?: string;
  rows?: number;
  files: string[];
  message?: string;
}

export interface Fetcher {
  id: string;
  name: string;
  /** How often the publisher updates it. Static sources are fetched once and skipped while their output exists. */
  cadence: Cadence;
  /** Fetchers whose outputs this one reads (run first). */
  needs?: string[];
  run(): Promise<FetchResult>;
}

export type { ManifestEntry };
