import { useState } from 'react';
import { activeFilterCount, useAvailableMetrics } from '../hooks/useDerived';
import { CATEGORIES, MAP_METRICS, METRIC_BY_KEY, METRICS } from '../lib/metrics';
import { focusOptions, GOALS, type GoalId } from '../lib/presets';
import { TRAM_SUBURB_SHARE, useStore } from '../store';
import { NumberField, Pill, Section, Segmented, Toggle } from './ui';

export function ViewControls() {
  const type = useStore((s) => s.type);
  const setType = useStore((s) => s.setType);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const goal = useStore((s) => s.goal);
  const setGoal = useStore((s) => s.setGoal);
  const focus = useStore((s) => s.focus);
  const setFocus = useStore((s) => s.setFocus);
  const layers = useStore((s) => s.layers);
  const toggleLayer = useStore((s) => s.toggleLayer);
  const available = useAvailableMetrics();

  return (
    <div className="controls">
      <Segmented
        label="Property type"
        value={type}
        onChange={setType}
        options={[
          { value: 'houses', label: 'Houses' },
          { value: 'units', label: 'Units' },
          { value: 'land', label: 'Land' },
        ]}
      />

      <div className="field">
        <label htmlFor="metric-select">Colour suburbs by</label>
        <select id="metric-select" className="input select" value={view} onChange={(e) => setView(e.target.value)}>
          <option value="score">Investment score</option>
          {MAP_METRICS.filter((k) => available.has(k)).map((k) => (
            <option key={k} value={k}>
              {METRIC_BY_KEY[k].label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="goal-select">Buying for</label>
        <select id="goal-select" className="input select" value={goal} onChange={(e) => setGoal(e.target.value as GoalId)} aria-describedby="goal-hint">
          {Object.values(GOALS).map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        <p className="field__hint muted" id="goal-hint">
          {GOALS[goal].description}
        </p>
      </div>

      <div className="field">
        <span className="field__label">Focus</span>
        <div className="pill-row">
          {focusOptions(goal).map((f) => (
            <Pill key={f.id} active={focus === f.id} onClick={() => setFocus(f.id)} title={f.description}>
              {f.label}
            </Pill>
          ))}
          {focus === 'custom' && (
            <Pill active onClick={() => undefined}>
              Custom
            </Pill>
          )}
        </div>
      </div>

      <div className="field">
        <span className="field__label">Layers</span>
        <Toggle checked={layers.tram} onChange={() => toggleLayer('tram')} label="Tram lines" hint="Routes, stops and walking catchments" />
        {layers.tram && <Toggle checked={layers.tramCatchment} onChange={() => toggleLayer('tramCatchment')} label="400 m and 800 m catchments" />}
        <Toggle checked={layers.train} onChange={() => toggleLayer('train')} label="Train lines" />
      </div>
    </div>
  );
}

export function FiltersPanel() {
  const available = useAvailableMetrics();
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const reset = useStore((s) => s.resetFilters);
  const k = (v: number | null) => (v == null ? null : v / 1000);
  return (
    <div className="filters">
      <div className="field-row">
        <NumberField label="Budget from" prefix="$" suffix="k" step={50} value={k(filters.priceMin)} onChange={(v) => setFilters({ priceMin: v == null ? null : v * 1000 })} />
        <NumberField label="Budget to" prefix="$" suffix="k" step={50} value={k(filters.priceMax)} onChange={(v) => setFilters({ priceMax: v == null ? null : v * 1000 })} />
      </div>
      <div className="field-row">
        <NumberField label="Minimum yield" suffix="%" step={0.1} value={filters.minYield} onChange={(v) => setFilters({ minYield: v })} />
        {available.has('vacancy') && <NumberField label="Maximum vacancy" suffix="%" step={0.1} value={filters.maxVacancy} onChange={(v) => setFilters({ maxVacancy: v })} />}
      </div>
      <NumberField label="Maximum distance to CBD" suffix="km" step={1} value={filters.maxDistanceCbd} onChange={(v) => setFilters({ maxDistanceCbd: v })} />
      <Toggle checked={filters.tramOnly} onChange={(v) => setFilters({ tramOnly: v })} label="Tram suburbs only" hint={`At least ${TRAM_SUBURB_SHARE * 100}% of the suburb within 800 m of a stop`} />
      {activeFilterCount(filters) > 0 && (
        <button type="button" className="link-button" onClick={reset}>
          Clear filters
        </button>
      )}
    </div>
  );
}

export function WeightsPanel() {
  const weights = useStore((s) => s.categoryWeights);
  const setWeight = useStore((s) => s.setCategoryWeight);
  const applyPenalties = useStore((s) => s.applyPenalties);
  const setApplyPenalties = useStore((s) => s.setApplyPenalties);
  const available = useAvailableMetrics();
  const hasData = (id: string) => METRICS.some((m) => m.category === id && available.has(m.key));
  const total = CATEGORIES.filter((c) => hasData(c.id)).reduce((a, c) => a + weights[c.id], 0) || 1;
  return (
    <div className="weights">
      {CATEGORIES.map((c) => {
        const live = hasData(c.id);
        return (
          <div className={`slider${live ? '' : ' is-empty'}`} key={c.id}>
            <div className="slider__head">
              <label htmlFor={`w-${c.id}`}>{c.label}</label>
              <span className="muted">{live ? `${Math.round((weights[c.id] / total) * 100)}%` : 'No data loaded'}</span>
            </div>
            <input id={`w-${c.id}`} type="range" min={0} max={50} step={1} value={weights[c.id]} disabled={!live} onChange={(e) => setWeight(c.id, Number(e.target.value))} aria-describedby={`wd-${c.id}`} />
            <div className="slider__hint muted" id={`wd-${c.id}`}>
              {live ? c.description : `${c.description} Not counted until a source is connected.`}
            </div>
          </div>
        );
      })}
      <Toggle checked={applyPenalties} onChange={setApplyPenalties} label="Apply risk penalties" hint="Deduct points for flood, bushfire, oversupply and apartment-heavy flags" />
    </div>
  );
}

export function ControlSections() {
  const [open, setOpen] = useState<'filters' | 'weights' | null>(null);
  const filters = useStore((s) => s.filters);
  const n = activeFilterCount(filters);
  return (
    <>
      <Section title="Filters" open={open === 'filters'} onToggle={() => setOpen(open === 'filters' ? null : 'filters')} badge={n || undefined}>
        <FiltersPanel />
      </Section>
      <Section title="Weights" open={open === 'weights'} onToggle={() => setOpen(open === 'weights' ? null : 'weights')}>
        <WeightsPanel />
      </Section>
    </>
  );
}
