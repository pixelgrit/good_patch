import { useMemo } from 'react';
import { METRIC_BY_KEY, METRICS as METRICS_ALL } from '../lib/metrics';
import { getMetric, getValue, scoreAll, type SuburbScore } from '../lib/scoring';
import type { Suburb } from '../lib/types';
import { TRAM_SUBURB_SHARE, useStore, type Filters } from '../store';

export function useSuburbs(): Suburb[] {
  return useStore((s) => s.dataset?.suburbs ?? EMPTY);
}
const EMPTY: Suburb[] = [];

export function useSuburbByCode(): Map<string, Suburb> {
  const suburbs = useSuburbs();
  return useMemo(() => new Map(suburbs.map((s) => [s.code, s])), [suburbs]);
}

export function useScores(): Map<string, SuburbScore> {
  const suburbs = useSuburbs();
  const type = useStore((s) => s.type);
  const categoryWeights = useStore((s) => s.categoryWeights);
  const metricMultipliers = useStore((s) => s.metricMultipliers);
  const applyPenalties = useStore((s) => s.applyPenalties);
  return useMemo(
    () => scoreAll(suburbs, { type, categoryWeights, metricMultipliers, applyPenalties }),
    [suburbs, type, categoryWeights, metricMultipliers, applyPenalties],
  );
}

export function passesFilters(s: Suburb, type: 'houses' | 'units', f: Filters): boolean {
  const price = getValue(s, type, 'medianPrice');
  if (f.priceMin != null && (price == null || price < f.priceMin)) return false;
  if (f.priceMax != null && (price == null || price > f.priceMax)) return false;
  const y = getValue(s, type, 'grossYield');
  if (f.minYield != null && (y == null || y < f.minYield)) return false;
  const vac = getValue(s, type, 'vacancy');
  if (f.maxVacancy != null && (vac == null || vac > f.maxVacancy)) return false;
  const dist = getValue(s, type, 'distanceCbd');
  if (f.maxDistanceCbd != null && (dist == null || dist > f.maxDistanceCbd)) return false;
  if (f.tramOnly && s.access.tramShare800 < TRAM_SUBURB_SHARE) return false;
  return true;
}

export function useFilteredCodes(): Set<string> {
  const suburbs = useSuburbs();
  const type = useStore((s) => s.type);
  const filters = useStore((s) => s.filters);
  return useMemo(() => new Set(suburbs.filter((s) => passesFilters(s, type, filters)).map((s) => s.code)), [suburbs, type, filters]);
}

export function activeFilterCount(f: Filters): number {
  return [f.priceMin, f.priceMax, f.minYield, f.maxVacancy, f.maxDistanceCbd].filter((v) => v != null).length + (f.tramOnly ? 1 : 0);
}

export interface MapValues {
  /** code -> 0..1 colour position, or null for no data. */
  t: Map<string, number | null>;
  /** Legend ticks (left to right). */
  ticks: { at: number; label: string }[];
  lowLabel: string;
  highLabel: string;
  title: string;
  note: string;
}

/** Colour positions for the current view (composite score or a single metric). */
export function useMapValues(scores: Map<string, SuburbScore>): MapValues {
  const suburbs = useSuburbs();
  const type = useStore((s) => s.type);
  const view = useStore((s) => s.view);

  return useMemo(() => {
    const t = new Map<string, number | null>();
    if (view === 'score') {
      const vals = [...scores.values()].map((s) => s.score).filter((v): v is number => v != null).sort((a, b) => a - b);
      const lo = quantile(vals, 0.02) ?? 0;
      const hi = quantile(vals, 0.98) ?? 100;
      for (const s of suburbs) {
        const sc = scores.get(s.code)?.score;
        t.set(s.code, sc == null ? null : clamp01((sc - lo) / Math.max(1, hi - lo)));
      }
      const mid = (lo + hi) / 2;
      return {
        t,
        ticks: [
          { at: 0, label: Math.round(lo).toString() },
          { at: 0.5, label: Math.round(mid).toString() },
          { at: 1, label: Math.round(hi).toString() },
        ],
        lowLabel: 'Weaker',
        highLabel: 'Stronger',
        title: 'Investment score',
        note: 'Composite of percentiles, 0–100',
      };
    }

    // Single metric: colour by goodness percentile so brighter is always better
    // (neutral metrics such as price: brighter is higher).
    const def = METRIC_BY_KEY[view];
    const pairs: { pct: number; v: number }[] = [];
    for (const s of suburbs) {
      const m = getMetric(s, type, view);
      const pct = m?.pct ?? null;
      t.set(s.code, pct == null ? null : pct / 100);
      if (pct != null && m?.value != null) pairs.push({ pct, v: m.value });
    }
    pairs.sort((a, b) => a.pct - b.pct);
    const at = (p: number) => {
      if (!pairs.length) return '—';
      const target = p * 100;
      let best = pairs[0];
      for (const x of pairs) if (Math.abs(x.pct - target) < Math.abs(best.pct - target)) best = x;
      return formatShort(def.unit, best.v);
    };
    const direction =
      def.direction === 'low' ? 'Lower values score better' : def.direction === 'high' ? 'Higher values score better' : 'Not scored directly';
    return {
      t,
      ticks: [
        { at: 0, label: at(0) },
        { at: 0.5, label: at(0.5) },
        { at: 1, label: at(1) },
      ],
      lowLabel: def.direction === 'neutral' ? 'Lower' : 'Weaker',
      highLabel: def.direction === 'neutral' ? 'Higher' : 'Stronger',
      title: def.label,
      note: direction,
    };
  }, [suburbs, scores, type, view]);
}

function formatShort(unit: string, v: number): string {
  switch (unit) {
    case 'aud':
      return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}m` : `$${Math.round(v / 1000)}k`;
    case 'audWeekly':
      return `$${Math.round(v)}`;
    case 'pct':
      return `${v.toFixed(1)}%`;
    case 'days':
      return `${Math.round(v)}d`;
    case 'km':
      return `${v.toFixed(0)} km`;
    case 'decile':
      return `${Math.round(v)}`;
    default:
      return v.toFixed(1);
  }
}

function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Metric keys with at least one value for the current property type. */
export function useAvailableMetrics(): Set<string> {
  const suburbs = useSuburbs();
  const type = useStore((s) => s.type);
  return useMemo(() => {
    const out = new Set<string>();
    for (const def of METRICS_ALL) {
      if (suburbs.some((s) => getValue(s, type, def.key) != null)) out.add(def.key);
    }
    return out;
  }, [suburbs, type]);
}
