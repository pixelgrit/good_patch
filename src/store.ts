import { create } from 'zustand';
import { PRESETS, type CategoryWeights, type PresetId } from './lib/presets';
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
  preset: PresetId;
  categoryWeights: CategoryWeights;
  metricMultipliers: Partial<Record<string, number>>;
  applyPenalties: boolean;
  filters: Filters;
  layers: { tram: boolean; tramCatchment: boolean; train: boolean };
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
  setPreset(p: Exclude<PresetId, 'custom'>): void;
  setCategoryWeight(id: CategoryId, w: number): void;
  setApplyPenalties(v: boolean): void;
  setFilters(f: Partial<Filters>): void;
  resetFilters(): void;
  toggleLayer(k: keyof State['layers']): void;
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
  preset: 'balanced',
  categoryWeights: { ...PRESETS.balanced.categories },
  metricMultipliers: { ...PRESETS.balanced.metricMultipliers },
  applyPenalties: false,
  filters: { ...EMPTY_FILTERS },
  layers: { tram: false, tramCatchment: true, train: false },
  hovered: null,
  selected: null,
  pinned: [],
  compareOpen: false,
  drawerOpen: false,
  flyTo: null,

  setDataset: (dataset) => set({ dataset }),
  setLoadError: (loadError) => set({ loadError }),
  setType: (type) => set({ type }),
  setView: (view) => set({ view }),
  setPreset: (p) => set({ preset: p, categoryWeights: { ...PRESETS[p].categories }, metricMultipliers: { ...PRESETS[p].metricMultipliers } }),
  setCategoryWeight: (id, w) => set((s) => ({ preset: 'custom', categoryWeights: { ...s.categoryWeights, [id]: w } })),
  setApplyPenalties: (applyPenalties) => set({ applyPenalties }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  resetFilters: () => set({ filters: { ...EMPTY_FILTERS } }),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
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
