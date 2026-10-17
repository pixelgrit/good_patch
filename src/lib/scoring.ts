import { CATEGORIES, METRICS, METRIC_BY_KEY, type MetricDef } from './metrics';
import { MAX_MISSING_SHARE, RISK_PENALTIES, type CategoryWeights, type RiskFlagId } from './presets';
import type { CategoryId, MetricValue, PropertyType, Suburb } from './types';

/* ------------------------------------------------------------------ */
/* Lookup                                                              */
/* ------------------------------------------------------------------ */

export function getMetric(s: Suburb, type: PropertyType, key: string): MetricValue | undefined {
  const def = METRIC_BY_KEY[key];
  if (!def) return undefined;
  if (!def.types.includes(type)) return undefined;
  return def.scope === 'common' ? s.common[key] : s[type].metrics[key];
}

export function getValue(s: Suburb, type: PropertyType, key: string): number | null {
  const m = getMetric(s, type, key);
  return m && m.value != null && Number.isFinite(m.value) ? m.value : null;
}

/* ------------------------------------------------------------------ */
/* Percentiles (run by the build script, reusable at runtime)          */
/* ------------------------------------------------------------------ */

/**
 * Mid-rank percentile of each value within its own list, 0–100.
 * Ties share the same percentile.
 */
export function percentileRanks(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [50];
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    const below = lo;
    let equal = 0;
    for (let i = lo; i < n && sorted[i] === v; i++) equal++;
    return ((below + (equal - 1) / 2) / (n - 1)) * 100;
  });
}

/**
 * Writes `pct` (goodness percentile, higher is better) onto every metric value,
 * computed across all suburbs with data, separately for houses and units.
 * Neutral metrics get an ascending percentile (used only for map colouring).
 */
export function applyPercentiles(suburbs: Suburb[]): void {
  const types: PropertyType[] = ['houses', 'units'];
  for (const def of METRICS) {
    for (const type of types) {
      if (!def.types.includes(type)) continue;
      // Common metrics are identical for both types; compute once on 'houses' pass.
      if (def.scope === 'common' && type === 'units' && def.types.includes('houses')) continue;
      const holders: MetricValue[] = [];
      const vals: number[] = [];
      for (const s of suburbs) {
        const m = def.scope === 'common' ? s.common[def.key] : s[type].metrics[def.key];
        if (m && m.value != null && Number.isFinite(m.value)) {
          holders.push(m);
          vals.push(m.value);
        } else if (m) {
          m.pct = null;
        }
      }
      const ranks = percentileRanks(vals);
      holders.forEach((m, i) => {
        const r = ranks[i];
        m.pct = round1(def.direction === 'low' ? 100 - r : r);
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Composite score                                                     */
/* ------------------------------------------------------------------ */

export interface MetricContribution {
  key: string;
  def: MetricDef;
  category: CategoryId;
  value: number | null;
  pct: number | null;
  /** Effective weight in the composite, 0–1 (sums to 1 over available metrics). */
  weight: number;
  /** Points contributed to the composite. */
  contribution: number;
  source: MetricValue['source'] | null;
  asAt: string | null;
  mock: boolean;
  approx: boolean;
}

export interface CategoryScore {
  id: CategoryId;
  label: string;
  score: number | null;
  weight: number;
}

export interface RiskFlag {
  id: RiskFlagId;
  label: string;
  detail: string;
  penalty: number;
}

export interface SuburbScore {
  code: string;
  /** Composite 0–100, or null when there isn't enough data. */
  score: number | null;
  /** Composite before risk penalties. */
  rawScore: number | null;
  insufficient: boolean;
  missingShare: number;
  categories: CategoryScore[];
  metrics: MetricContribution[];
  flags: RiskFlag[];
  penalty: number;
}

export interface ScoringOptions {
  type: PropertyType;
  categoryWeights: CategoryWeights;
  metricMultipliers: Partial<Record<string, number>>;
  applyPenalties: boolean;
}

/**
 * A metric is scored only when at least this share of priced suburbs has a
 * value, so patchy sources don't skew comparisons.
 */
export const MIN_COVERAGE = 0.4;

/** Metric keys that are scored: in a category and covering enough suburbs. Others are shown but don't count as "missing". */
export function availableMetricKeys(suburbs: Suburb[], type: PropertyType): Set<string> {
  const out = new Set<string>();
  // Coverage is measured over suburbs with a median price for this property type.
  const priced = suburbs.filter((s) => getValue(s, type, 'medianPrice') != null);
  if (!priced.length) return out;
  for (const def of METRICS) {
    if (!def.category || !def.types.includes(type)) continue;
    const n = priced.filter((s) => getValue(s, type, def.key) != null).length;
    if (n / priced.length >= MIN_COVERAGE) out.add(def.key);
  }
  return out;
}

export function riskFlags(s: Suburb, type: PropertyType): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (s.overlays?.flood) flags.push({ id: 'flood', label: 'Flood overlay', detail: 'Parts of the suburb sit under LSIO or FO flood overlays.', penalty: RISK_PENALTIES.flood });
  if (s.overlays?.bushfire) flags.push({ id: 'bushfire', label: 'Bushfire overlay', detail: 'Bushfire Management Overlay applies to parts of the suburb.', penalty: RISK_PENALTIES.bushfire });
  if (s.overlays?.heritage) flags.push({ id: 'heritage', label: 'Heritage overlay', detail: 'Heritage overlays limit redevelopment — often supports scarcity.', penalty: RISK_PENALTIES.heritage });
  const approvals = getValue(s, type, 'approvalsRatio');
  const stockTrend = getValue(s, type, 'supplyTrend');
  if (approvals != null && approvals > 2.5 && stockTrend != null && stockTrend > 0) {
    flags.push({ id: 'oversupply', label: 'Oversupply risk', detail: `Approvals ratio ${approvals.toFixed(1)}% with stock on market rising.`, penalty: RISK_PENALTIES.oversupply });
  }
  if (s.unitShare != null && s.renterShare != null && s.unitShare > 0.5 && s.renterShare > 0.55) {
    flags.push({ id: 'apartmentHeavy', label: 'Apartment-heavy', detail: `${Math.round(s.unitShare * 100)}% flats or apartments and ${Math.round(s.renterShare * 100)}% renting (Census 2021).`, penalty: RISK_PENALTIES.apartmentHeavy });
  }
  return flags;
}

export function scoreSuburb(s: Suburb, opts: ScoringOptions, available: Set<string>): SuburbScore {
  const { type, categoryWeights, metricMultipliers } = opts;

  // Raw (pre-normalisation) metric weights per category.
  const byCat = new Map<CategoryId, { def: MetricDef; w: number }[]>();
  for (const def of METRICS) {
    if (!def.category || !available.has(def.key)) continue;
    const w = def.weight * (metricMultipliers[def.key] ?? 1);
    if (w <= 0) continue;
    const list = byCat.get(def.category) ?? [];
    list.push({ def, w });
    byCat.set(def.category, list);
  }

  const activeCats = CATEGORIES.filter((c) => (categoryWeights[c.id] ?? 0) > 0 && byCat.has(c.id));
  const catWeightSum = activeCats.reduce((a, c) => a + categoryWeights[c.id], 0);

  let totalPlanned = 0;
  let totalMissing = 0;
  const metrics: MetricContribution[] = [];
  const categories: CategoryScore[] = [];
  let composite = 0;
  let compositeWeight = 0;
  const rawW = new Map<string, number>();
  const catAvail = new Map<CategoryId, number>();

  for (const cat of CATEGORIES) {
    const list = byCat.get(cat.id) ?? [];
    const catShare = catWeightSum > 0 && activeCats.includes(cat) ? categoryWeights[cat.id] / catWeightSum : 0;
    const metricWeightSum = list.reduce((a, m) => a + m.w, 0);

    let catSum = 0;
    let catAvailW = 0;
    for (const { def, w } of list) {
      const mv = getMetric(s, type, def.key);
      const pct = mv?.pct ?? null;
      const planned = catShare * (metricWeightSum > 0 ? w / metricWeightSum : 0);
      rawW.set(def.key, w);
      totalPlanned += planned;
      if (pct == null) totalMissing += planned;
      else {
        catSum += pct * w;
        catAvailW += w;
      }
      metrics.push({
        key: def.key,
        def,
        category: cat.id,
        value: mv?.value ?? null,
        pct,
        weight: planned,
        contribution: 0,
        source: mv?.source ?? null,
        asAt: mv?.asAt ?? null,
        mock: !!mv?.mock,
        approx: !!mv?.approx,
      });
    }
    catAvail.set(cat.id, catAvailW);
    const catScore = catAvailW > 0 ? catSum / catAvailW : null;
    categories.push({ id: cat.id, label: cat.label, score: catScore == null ? null : round1(catScore), weight: catShare });
    if (catScore != null && catShare > 0) {
      composite += catScore * catShare;
      compositeWeight += catShare;
    }
  }

  const missingShare = totalPlanned > 0 ? totalMissing / totalPlanned : 1;
  // Without a median price for this property type there is nothing to buy into: never score it.
  const unpriced = getValue(s, type, 'medianPrice') == null;
  const insufficient = unpriced || missingShare > MAX_MISSING_SHARE || compositeWeight === 0;
  const rawScore = insufficient ? null : composite / compositeWeight;

  // Effective weights over available data, so contributions sum exactly to the composite.
  const catShareById = new Map(categories.map((c) => [c.id, c.weight]));
  for (const m of metrics) {
    const avail = catAvail.get(m.category) ?? 0;
    if (m.pct != null && avail > 0 && compositeWeight > 0) {
      m.weight = ((catShareById.get(m.category) ?? 0) / compositeWeight) * ((rawW.get(m.key) ?? 0) / avail);
      m.contribution = m.pct * m.weight;
    } else {
      m.weight = 0;
      m.contribution = 0;
    }
  }

  const flags = riskFlags(s, type);
  const penalty = opts.applyPenalties ? flags.reduce((a, f) => a + f.penalty, 0) : 0;
  const score = rawScore == null ? null : Math.max(0, Math.min(100, rawScore - penalty));

  return {
    code: s.code,
    score: score == null ? null : round1(score),
    rawScore: rawScore == null ? null : round1(rawScore),
    insufficient,
    missingShare,
    categories,
    metrics,
    flags,
    penalty,
  };
}

export function scoreAll(suburbs: Suburb[], opts: ScoringOptions): Map<string, SuburbScore> {
  const available = availableMetricKeys(suburbs, opts.type);
  const out = new Map<string, SuburbScore>();
  for (const s of suburbs) out.set(s.code, scoreSuburb(s, opts, available));
  return out;
}

/** Two strongest and two weakest weighted factors. */
export function topFactors(sc: SuburbScore): { strong: MetricContribution[]; weak: MetricContribution[] } {
  const scored = sc.metrics.filter((m) => m.pct != null && m.weight > 0.01);
  const sorted = [...scored].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  return { strong: sorted.slice(0, 2), weak: sorted.slice(-2).reverse() };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
