import type { CategoryId } from './types';

export type CategoryWeights = Record<CategoryId, number>;

/* ------------------------------------------------------------------ */
/* Goals: what the purchase is for                                      */
/* ------------------------------------------------------------------ */

export type GoalId = 'flip' | 'hold' | 'home';

export interface Goal {
  id: GoalId;
  label: string;
  description: string;
  /** Category weights before the focus tilt. */
  categories: CategoryWeights;
  /** Multipliers on individual metric weights within their category. 0 drops a metric. */
  metricMultipliers: Partial<Record<string, number>>;
}

export const GOALS: Record<GoalId, Goal> = {
  flip: {
    id: 'flip',
    label: '3–5 year buy and sell',
    description: 'Buy, hold for a few years and sell. Leans on recent momentum, room to catch up with fundamentals and neighbours, and a market liquid enough to sell into. Recent growth counts most; ten-year growth not at all.',
    categories: { yield: 10, growth: 25, value: 25, supply: 15, demand: 15, location: 5, risk: 5, tram: 0 },
    metricMultipliers: { growth1y: 3, growth3y: 1.5, growth5y: 0.5, growth10y: 0, rentGrowth1y: 1, rentGrowth3y: 0.5, turnover: 2, dom: 1.5, ownerOccupier: 0.5, hazard: 0.5, growthVsHistory: 0.5 },
  },
  hold: {
    id: 'hold',
    label: 'Long-term investment',
    description: 'Hold for 10 years or more and rent it out. Weights rental yield and the lasting drivers of growth: location, scarce land and limited new supply. Long-run growth counts most; last year’s growth very little.',
    categories: { yield: 20, growth: 15, value: 10, supply: 15, demand: 5, location: 25, risk: 10, tram: 0 },
    metricMultipliers: { growth1y: 0.25, growth3y: 0.5, growth5y: 1, growth10y: 2, rentGrowth1y: 0.5, rentGrowth3y: 1.5, nrzShare: 2, landToAsset: 2, townhouseShare: 2, highriseShare: 1.5, unitDwellingShare: 1.5, turnover: 0 },
  },
  home: {
    id: 'home',
    label: 'Owner-occupier',
    description: 'Buy a home to live in. Weights location, affordability and low risk; rental yield is left out and long-run growth stands in for resale value.',
    categories: { yield: 0, growth: 10, value: 15, supply: 10, demand: 0, location: 50, risk: 15, tram: 0 },
    metricMultipliers: { growth1y: 0, growth3y: 0.5, growth5y: 1, growth10y: 2, rentGrowth1y: 0, rentGrowth3y: 0, priceToIncome: 1.5, neighbourGap: 0.5, ownerOccupier: 2, distanceTrain: 1.5, hazard: 2, approvalsRatio: 0.5 },
  },
};

/* ------------------------------------------------------------------ */
/* Focus: a tilt applied on top of the goal                            */
/* ------------------------------------------------------------------ */

export type FocusId = 'balanced' | 'cashflow' | 'growth' | 'custom';

export interface Focus {
  id: Exclude<FocusId, 'custom'>;
  label: string;
  description: string;
  /** Multipliers on the goal's category weights. */
  tilt: Partial<Record<CategoryId, number>>;
  /** Extra metric multipliers on top of the goal's. */
  metricMultipliers: Partial<Record<string, number>>;
}

export const FOCUS: Record<Exclude<FocusId, 'custom'>, Focus> = {
  balanced: { id: 'balanced', label: 'Balanced', description: 'The goal’s weights as they are.', tilt: {}, metricMultipliers: {} },
  cashflow: {
    id: 'cashflow',
    label: 'Cashflow',
    description: 'Yield and rent growth weighted up for rental income.',
    tilt: { yield: 2, growth: 0.7, location: 0.8 },
    metricMultipliers: { rentGrowth1y: 2, rentGrowth3y: 2 },
  },
  growth: {
    id: 'growth',
    label: 'Growth',
    description: 'Growth, value and supply constraints weighted up for capital gain.',
    tilt: { yield: 0.4, growth: 1.4, value: 1.3, supply: 1.3 },
    metricMultipliers: {},
  },
};

/** Focus options that make sense for a goal (cashflow is meaningless for a home you live in). */
export function focusOptions(goal: GoalId): Focus[] {
  return goal === 'home' ? [FOCUS.balanced, FOCUS.growth] : Object.values(FOCUS);
}

/** Category weights and metric multipliers for a goal and focus. */
export function weightsFor(goal: GoalId, focus: Exclude<FocusId, 'custom'>): { categories: CategoryWeights; metricMultipliers: Partial<Record<string, number>> } {
  const g = GOALS[goal];
  const f = FOCUS[focus];
  const categories = Object.fromEntries(Object.entries(g.categories).map(([k, v]) => [k, Math.round(v * (f.tilt[k as CategoryId] ?? 1))])) as CategoryWeights;
  const metricMultipliers: Partial<Record<string, number>> = { ...g.metricMultipliers };
  for (const [k, m] of Object.entries(f.metricMultipliers)) metricMultipliers[k] = (metricMultipliers[k] ?? 1) * (m ?? 1);
  return { categories, metricMultipliers };
}

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
