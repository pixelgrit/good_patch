import { create } from 'zustand';
import { LISTING_PRICE_DEFAULT } from './lib/listings';
import { weightsFor, type CategoryWeights, type FocusId, type GoalId } from './lib/presets';
import type { CategoryId, Dataset, PropertyType } from './lib/types';

export interface Filters {
  priceMin: number | null;
  priceMax: number | null;
  minYield: number | null;
  maxVacancy: number | null;
  maxDistanceCbd: number | null;
  tramOnly: boolean;
}

export const EMPTY_FILTERS: Filters = {
  priceMin: null,
  priceMax: null,
  minYield: null,
  maxVacancy: null,
  maxDistanceCbd: null,
  tramOnly: false,
};

/** A suburb counts as a "tram suburb" when at least this share is within 800 m of a stop. */
export const TRAM_SUBURB_SHARE = 0.25;

export const MAX_PINNED = 4;

interface State {
  dataset: Dataset | null;
  loadError: string | null;
  type: PropertyType;
  /** 'score' or a metric key. */
  view: string;
  goal: GoalId;
  focus: FocusId;
  categoryWeights: CategoryWeights;
  metricMultipliers: Partial<Record<string, number>>;
  applyPenalties: boolean;
  filters: Filters;
  layers: { tram: boolean; tramCatchment: boolean; train: boolean };
  /** Price cap for the for-sale links. */
  listingMaxPrice: number;
  hovered: string | null;
  selected: string | null;
  pinned: string[];
  compareOpen: boolean;
  drawerOpen: boolean;
  flyTo: { code: string; nonce: number } | null;

  setDataset(d: Dataset): void;
  setLoadError(e: string): void;
  setType(t: PropertyType): void;
  setView(v: string): void;
  setGoal(g: GoalId): void;
  setFocus(f: Exclude<FocusId, 'custom'>): void;
  setCategoryWeight(id: CategoryId, w: number): void;
  setApplyPenalties(v: boolean): void;
  setFilters(f: Partial<Filters>): void;
  resetFilters(): void;
  toggleLayer(k: keyof State['layers']): void;
  setListingMaxPrice(v: number): void;
  setHovered(c: string | null): void;
  select(c: string | null, fly?: boolean): void;
  togglePin(c: string): void;
  setCompareOpen(v: boolean): void;
  setDrawerOpen(v: boolean): void;
}

export const useStore = create<State>((set, get) => ({
  dataset: null,
  loadError: null,
  type: 'houses',
  view: 'score',
  goal: 'hold',
  focus: 'balanced',
  ...weightsState('hold', 'balanced'),
  applyPenalties: false,
  filters: { ...EMPTY_FILTERS },
  layers: { tram: true, tramCatchment: true, train: false },
  listingMaxPrice: LISTING_PRICE_DEFAULT,
  hovered: null,
  selected: null,
  pinned: [],
  compareOpen: false,
  drawerOpen: false,
  flyTo: null,

  setDataset: (dataset) => {
    // Data built before vacant land was added has no land block.
    for (const s of dataset.suburbs) s.land ??= { metrics: {}, series: {} };
    set({ dataset });
  },
  setLoadError: (loadError) => set({ loadError }),
  setType: (type) => set({ type }),
  setView: (view) => set({ view }),
  setGoal: (goal) =>
    set((s) => {
      // Cashflow doesn't apply to a home; custom weights reset to the new goal's.
      const focus = s.focus === 'custom' || (goal === 'home' && s.focus === 'cashflow') ? 'balanced' : s.focus;
      return { goal, focus, ...weightsState(goal, focus) };
    }),
  setFocus: (focus) => set((s) => ({ focus, ...weightsState(s.goal, focus) })),
  setCategoryWeight: (id, w) => set((s) => ({ focus: 'custom', categoryWeights: { ...s.categoryWeights, [id]: w } })),
  setApplyPenalties: (applyPenalties) => set({ applyPenalties }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  resetFilters: () => set({ filters: { ...EMPTY_FILTERS } }),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setListingMaxPrice: (listingMaxPrice) => set({ listingMaxPrice }),
  setHovered: (hovered) => set({ hovered }),
  select: (selected, fly = false) =>
    set({ selected, drawerOpen: false, flyTo: fly && selected ? { code: selected, nonce: Date.now() } : get().flyTo }),
  togglePin: (c) =>
    set((s) => {
      if (s.pinned.includes(c)) {
        const pinned = s.pinned.filter((x) => x !== c);
        return { pinned, compareOpen: pinned.length > 0 && s.compareOpen };
      }
      if (s.pinned.length >= MAX_PINNED) return {};
      return { pinned: [...s.pinned, c] };
    }),
  setCompareOpen: (compareOpen) => set({ compareOpen }),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
}));

function weightsState(goal: GoalId, focus: Exclude<FocusId, 'custom'>) {
  const { categories, metricMultipliers } = weightsFor(goal, focus);
  return { categoryWeights: categories, metricMultipliers };
}
