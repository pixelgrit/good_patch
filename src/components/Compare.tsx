import { useAvailableMetrics, useSuburbByCode } from '../hooks/useDerived';
import { formatMetric, formatScore, formatValue } from '../lib/format';
import { METRIC_BY_KEY } from '../lib/metrics';
import { getValue, type SuburbScore } from '../lib/scoring';
import type { SeriesKey } from '../lib/types';
import { MAX_PINNED, useStore } from '../store';
import { TYPE_LABEL } from '../lib/types';
import { Pill, Sparkline } from './ui';

const ROWS = ['medianPrice', 'medianRent', 'grossYield', 'vacancy', 'dom', 'growth1y', 'growth5y', 'sales12m', 'stockOnMarket', 'approvalsRatio', 'clearance', 'priceToIncome', 'ownerOccupier', 'seifa', 'distanceCbd', 'tramShare800'];
const TRENDS: { key: SeriesKey; label: string; unit: 'aud' | 'audWeekly' | 'pct' | 'days' }[] = [
  { key: 'price', label: 'Price', unit: 'aud' },
  { key: 'rent', label: 'Rent', unit: 'audWeekly' },
  { key: 'dom', label: 'Days on market', unit: 'days' },
  { key: 'vacancy', label: 'Vacancy', unit: 'pct' },
];

export function PinnedTray() {
  const pinned = useStore((s) => s.pinned);
  const open = useStore((s) => s.compareOpen);
  const setOpen = useStore((s) => s.setCompareOpen);
  const togglePin = useStore((s) => s.togglePin);
  const select = useStore((s) => s.select);
  const byCode = useSuburbByCode();
  if (!pinned.length || open) return null;
  return (
    <div className="tray" aria-label="Pinned suburbs">
      <span className="tray__label muted">
        Pinned {pinned.length}/{MAX_PINNED}
      </span>
      {pinned.map((c) => (
        <span className="chip" key={c}>
          <button type="button" className="chip__name" onClick={() => select(c, true)}>
            {byCode.get(c)?.name}
          </button>
          <button type="button" className="chip__x" aria-label={`Unpin ${byCode.get(c)?.name}`} onClick={() => togglePin(c)}>
            <svg width="8" height="8" viewBox="0 0 8 8">
              <path d="M1 1l6 6M7 1 1 7" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
        </span>
      ))}
      <Pill active onClick={() => setOpen(true)}>
        Compare
      </Pill>
    </div>
  );
}

export function ComparePanel({ scores }: { scores: Map<string, SuburbScore> }) {
  const pinned = useStore((s) => s.pinned);
  const open = useStore((s) => s.compareOpen);
  const setOpen = useStore((s) => s.setCompareOpen);
  const togglePin = useStore((s) => s.togglePin);
  const type = useStore((s) => s.type);
  const byCode = useSuburbByCode();
  const available = useAvailableMetrics();
  if (!open || !pinned.length) return null;
  const subs = pinned.map((c) => byCode.get(c)!).filter(Boolean);
  const rows = ROWS.filter((k) => available.has(k));
  const trends = TRENDS.filter((t) => subs.some((s) => (s[type].series[t.key]?.length ?? 0) > 1));

  // Best value per row, by goodness direction
  const best = (key: string) => {
    const def = METRIC_BY_KEY[key];
    if (def.direction === 'neutral') return null;
    const vals = subs.map((s) => getValue(s, type, key));
    const valid = vals.filter((v): v is number => v != null);
    if (valid.length < 2) return null;
    return def.direction === 'high' ? Math.max(...valid) : Math.min(...valid);
  };

  return (
    <section className="compare" aria-label="Compare suburbs">
      <header className="compare__head">
        <h2>Compare</h2>
        <span className="muted">{TYPE_LABEL[type]}</span>
        <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close compare">
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </header>
      <div className="compare__scroll">
        <table className="compare__table" style={{ ['--cols' as string]: subs.length }}>
          <thead>
            <tr>
              <th />
              {subs.map((s) => (
                <th key={s.code}>
                  <div className="compare__name">{s.name}</div>
                  <div className="compare__score">{scores.get(s.code)?.insufficient ? 'Not enough data' : formatScore(scores.get(s.code)?.score)}</div>
                  <button type="button" className="link-button" onClick={() => togglePin(s.code)}>
                    Unpin
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trends.map((t) => (
              <tr key={t.key} className="compare__trend">
                <th>{t.label}</th>
                {subs.map((s) => {
                  const pts = s[type].series[t.key] ?? [];
                  return (
                    <td key={s.code}>
                      <Sparkline values={pts.map((p) => p.v)} width={110} height={28} label={`${s.name} ${t.label}`} />
                      <div className="muted">{formatValue(t.unit, pts[pts.length - 1]?.v)}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.map((k) => {
              const def = METRIC_BY_KEY[k];
              const b = best(k);
              return (
                <tr key={k}>
                  <th>{def.label}</th>
                  {subs.map((s) => {
                    const v = getValue(s, type, k);
                    return (
                      <td key={s.code} className={b != null && v === b ? 'is-best' : ''}>
                        {formatMetric(def, v, true)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
