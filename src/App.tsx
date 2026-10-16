import { useEffect, useState } from 'react';
import { ComparePanel, PinnedTray } from './components/Compare';
import { ControlSections, ViewControls } from './components/ControlPanel';
import { DetailPanel } from './components/DetailPanel';
import { Legend } from './components/Legend';
import { MapView } from './components/MapView';
import { Search } from './components/Search';
import { activeFilterCount, useFilteredCodes, useMapValues, useScores } from './hooks/useDerived';
import { formatDate } from './lib/format';
import type { Dataset } from './lib/types';
import { useStore } from './store';

function useIsMobile() {
  const q = '(max-width: 759px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

export default function App() {
  const dataset = useStore((s) => s.dataset);
  const loadError = useStore((s) => s.loadError);
  const drawerOpen = useStore((s) => s.drawerOpen);
  const setDrawerOpen = useStore((s) => s.setDrawerOpen);
  const filters = useStore((s) => s.filters);
  const mobile = useIsMobile();

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/suburbs.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Dataset>;
      })
      .then((d) => useStore.getState().setDataset(d))
      .catch((e) => useStore.getState().setLoadError(`Couldn't load suburb data (${e.message}). Run "npm run data" to build it.`));
  }, []);

  const scores = useScores();
  const visible = useFilteredCodes();
  const values = useMapValues(scores);
  const total = dataset?.suburbs.length ?? 0;
  const nFilters = activeFilterCount(filters);

  const brand = (
    <div className="brand">
      <h1>Propa</h1>
      <span className="muted">Melbourne suburb investment map</span>
    </div>
  );

  const okSources = (dataset?.sources ?? []).filter((s) => s.status === 'ok');
  const lastRefresh = okSources.map((s) => s.fetchedAt).sort().pop();
  const failed = (dataset?.sources ?? []).filter((s) => s.status === 'failed').length;
  const dataNote = dataset && (
    <p className="data-note muted">
      {dataset.mock ? 'Mock data for ' : 'Data for '}
      {total} suburbs · {lastRefresh ? `sources refreshed ${formatDate(lastRefresh)}` : `built ${formatDate(dataset.generatedAt)}`}
      {failed ? ` · ${failed} source${failed > 1 ? 's' : ''} failed to update, showing the last good data` : ''}
      {dataset.approxGeometry ? '. Suburb boundaries and transport lines are approximate.' : ''}
    </p>
  );

  return (
    <div className="app">
      {dataset && <MapView values={values} scores={scores} visible={visible} />}

      {loadError && <div className="load-error">{loadError}</div>}
      {!dataset && !loadError && <div className="loading muted">Loading suburbs</div>}

      {dataset && !mobile && (
        <div className="sidebar">
          {brand}
          <Search />
          <ViewControls />
          <ControlSections />
          {dataNote}
        </div>
      )}

      {dataset && mobile && (
        <>
          <div className="topbar">
            {brand}
            <div className="topbar__row">
              <Search />
              <button type="button" className={`pill${drawerOpen ? ' is-active' : ''}`} onClick={() => setDrawerOpen(!drawerOpen)} aria-expanded={drawerOpen}>
                Filters{nFilters ? ` (${nFilters})` : ''}
              </button>
            </div>
          </div>
          {drawerOpen && <div className="scrim" onClick={() => setDrawerOpen(false)} />}
          <div className={`drawer${drawerOpen ? ' is-open' : ''}`} aria-hidden={!drawerOpen}>
            <div className="drawer__grip" aria-hidden />
            <ViewControls />
            <ControlSections />
            {dataNote}
            <button type="button" className="pill is-active drawer__done" onClick={() => setDrawerOpen(false)}>
              Show map
            </button>
          </div>
        </>
      )}

      {dataset && <Legend values={values} shown={visible.size} total={total} />}
      {dataset && <DetailPanel scores={scores} />}
      {dataset && <PinnedTray />}
      {dataset && <ComparePanel scores={scores} />}

      <footer className="disclaimer">
        Scores are a research aid, not financial advice. Check every figure with the original source and get independent advice before buying.
      </footer>
    </div>
  );
}
