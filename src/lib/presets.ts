import type { CategoryId } from './types';

export type PresetId = 'balanced' | 'cashflow' | 'growth' | 'custom';

export type CategoryWeights = Record<CategoryId, number>;

export interface Preset {
  id: PresetId;
  label: string;
  description: string;
  categories: CategoryWeights;
  /** Multipliers applied to individual metric weights within their category. */
  metricMultipliers: Partial<Record<string, number>>;
}

export const PRESETS: Record<Exclude<PresetId, 'custom'>, Preset> = {
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    description: 'Equal weight on yield, supply, demand, growth and quality.',
    categories: { yield: 20, supply: 20, demand: 20, growth: 20, quality: 20, tram: 0 },
    metricMultipliers: {},
  },
  cashflow: {
    id: 'cashflow',
    label: 'Cashflow',
    description: 'Yield and vacancy weighted up for rental return.',
    categories: { yield: 40, supply: 10, demand: 25, growth: 10, quality: 15, tram: 0 },
    metricMultipliers: { vacancy: 2, grossYield: 1.5, rentGrowth1y: 1.5 },
  },
  growth: {
    id: 'growth',
    label: 'Growth',
    description: 'Supply, days-on-market trend, owner-occupiers and SEIFA weighted up.',
    categories: { yield: 5, supply: 25, demand: 20, growth: 20, quality: 30, tram: 0 },
    metricMultipliers: { domTrend: 2, supplyTrend: 1.5, approvalsRatio: 1.5, ownerOccupier: 2, seifa: 2 },
  },
};

/** Suburbs missing more than this share of weighted inputs are shown as "not enough data". */
export const MAX_MISSING_SHARE = 0.35;

/** Score penalties applied when "Apply risk penalties" is on. */
export const RISK_PENALTIES = {
  flood: 5,
  bushfire: 5,
  oversupply: 8,
  apartmentHeavy: 4,
  heritage: 0,
} as const;

export type RiskFlagId = keyof typeof RISK_PENALTIES;
