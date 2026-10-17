import { useState } from 'react';
import { useAvailableMetrics, useSuburbByCode } from '../hooks/useDerived';
import { formatDate, formatDistance, formatMetric, formatScore, formatValue } from '../lib/format';
import { METRIC_BY_KEY } from '../lib/metrics';
import { FOCUS, GOALS } from '../lib/presets';
import { getMetric, type SuburbScore } from '../lib/scoring';
import { isStale, SOURCES } from '../lib/sources';
import { rampColor } from '../lib/colors';
import { listingLinks } from '../lib/listings';
import { PROPERTY_TYPES, TYPE_LABEL, TYPE_SINGULAR, type MetricValue, type SeriesKey, type Suburb } from '../lib/types';
import { MAX_PINNED, TRAM_SUBURB_SHARE, useStore } from '../store';
import { Pill, Sparkline } from './ui';

/** Shown in this order, skipping any metric with no data loaded. */
const KEY_FIGURES = ['medianPrice', 'medianRent', 'grossYield', 'vacancy', 'dom', 'growth1y', 'sales12m', 'stockOnMarket', 'approvalsRatio', 'clearance', 'ownerOccupier', 'seifa'];

const SERIES: { key: SeriesKey; label: string; unit: 'aud' | 'audWeekly' | 'pct' | 'days' }[] = [
  { key: 'price', label: 'Median price', unit: 'aud' },
  { key: 'rent', label: 'Median rent', unit: 'audWeekly' },
  { key: 'vacancy', label: 'Vacancy', unit: 'pct' },
  { key: 'dom', label: 'Days on market', unit: 'days' },
];

export function DetailPanel({ scores }: { scores: Map<string, SuburbScore> }) {
  const code = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const byCode = useSuburbByCode();
  const s = code ? byCode.get(code) : undefined;
  const sc = code ? scores.get(code) : undefined;
  if (!s || !sc) return null;
  return (
    <aside className="detail" aria-label={`${s.name} details`}>
      <button type="button" className="icon-button detail__close" onClick={() => select(null)} aria-label="Close details">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <div className="detail__grip" aria-hidden />
      <div className="detail__scroll">
        <DetailBody s={s} sc={sc} />
      </div>
    </aside>
  );
}

function DetailBody({ s, sc }: { s: Suburb; sc: SuburbScore }) {
  const type = useStore((st) => st.type);
  const goal = useStore((st) => st.goal);
  const focus = useStore((st) => st.focus);
  const pinned = useStore((st) => st.pinned);
  const togglePin = useStore((st) => st.togglePin);
  const setCompareOpen = useStore((st) => st.setCompareOpen);
  const setType = useStore((st) => st.setType);
  // Where this type has no sales, offer the first type that does.
  const other = PROPERTY_TYPES.find((t) => t !== type && s[t].metrics.medianPrice?.value != null);
  const links = listingLinks(s, type);
  const [showAll, setShowAll] = useState(false);
  const available = useAvailableMetrics();
  const figures = KEY_FIGURES.filter((k) => available.has(k)).slice(0, 8);
  const hasSeries = SERIES.some((x) => (s[type].series[x.key]?.length ?? 0) > 1);
  const isPinned = pinned.includes(s.code);
  const focusLabel = focus === 'custom' ? 'Custom weights' : `${FOCUS[focus].label} focus`;
  const approxGeometry = useStore((st) => st.dataset?.approxGeometry);

  return (
    <div className="detail__content">
      <header className="detail__header">
        <div className="detail__eyebrow muted">
          {[s.lga, s.postcode, TYPE_LABEL[type]].filter(Boolean).join(' · ')}
        </div>
        <h2>{s.name}</h2>
        <div className="detail__score">
          <span className="detail__score-num" style={{ borderColor: sc.score == null ? undefined : rampColor(sc.score / 100) }}>
            {sc.insufficient ? '—' : formatScore(sc.score)}
          </span>
          <span className="detail__score-meta">
            {sc.unpriced ? (
              <>
                No recent {TYPE_SINGULAR[type]} sales
                <span className="muted">Fewer than 5 sold in the latest quarter, so there is no median price to score.</span>
              </>
            ) : sc.insufficient ? (
              <>
                Not enough data
                <span className="muted">{Math.round(sc.missingShare * 100)}% of weighted inputs missing</span>
              </>
            ) : (
              <>
                Score for {GOALS[goal].label.toLowerCase()}
                <span className="muted">
                  {focusLabel}, out of 100{sc.penalty > 0 ? `, ${sc.penalty} points deducted for risk flags` : ''}
                </span>
              </>
            )}
          </span>
        </div>
        <div className="pill-row">
          <Pill active={isPinned} onClick={() => togglePin(s.code)} title={!isPinned && pinned.length >= MAX_PINNED ? `Up to ${MAX_PINNED} suburbs` : undefined}>
            {isPinned ? 'Pinned' : 'Pin to compare'}
          </Pill>
          {sc.unpriced && other && (
            <Pill onClick={() => setType(other)}>
              Show {TYPE_LABEL[other].toLowerCase()}
            </Pill>
          )}
          {pinned.length > 1 && (
            <Pill onClick={() => setCompareOpen(true)}>
              Compare {pinned.length}
            </Pill>
          )}
        </div>
      </header>

      <section className="detail__section">
        <h3>For sale now</h3>
        <div className="pill-row">
          {links.map((l) => (
            <a key={l.site} className="pill" href={l.url} target="_blank" rel="noopener noreferrer">
              {l.site}
            </a>
          ))}
        </div>
        <p className="muted note">
          {type === 'land' && s.rural ? 'Land, acreage and rural property' : TYPE_LABEL[type]} for sale in {s.name}, live on each site. Good patch links to the listings rather than copying them.
        </p>
      </section>

      <section className="detail__section">
        <h3>Key figures</h3>
        <div className="figures">
          {figures.map((k) => {
            const def = METRIC_BY_KEY[k];
            const mv = getMetric(s, type, k);
            return (
              <div className="figure" key={k}>
                <div className="figure__label muted">{def.label}</div>
                <div className="figure__value">{formatMetric(def, mv?.value)}</div>
                <Provenance mv={mv} />
              </div>
            );
          })}
        </div>
      </section>

      {!sc.unpriced && (
        <section className="detail__section">
          <h3>Score breakdown</h3>
          <div className="bars">
            {sc.categories
              .filter((c) => c.weight > 0)
              .map((c) => (
                <div className="bar" key={c.id}>
                  <div className="bar__label">
                    <span>{c.label}</span>
                    <span className="muted">{Math.round(c.weight * 100)}% weight</span>
                  </div>
                  <div className="bar__track">
                    <div className="bar__fill" style={{ width: `${c.score ?? 0}%`, background: c.score == null ? undefined : rampColor(c.score / 100) }} />
                  </div>
                  <div className="bar__value">{c.score == null ? '—' : Math.round(c.score)}</div>
                </div>
              ))}
          </div>
          <button type="button" className="link-button" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
            {showAll ? 'Hide metric detail' : 'Show every metric'}
          </button>
          {showAll && <MetricTable sc={sc} />}
        </section>
      )}

      <section className="detail__section">
        <h3>Five-year trend</h3>
        {!hasSeries ? (
          <p className="muted note">Price, rent, vacancy and days-on-market history isn't loaded yet. It needs the Valuer-General, Homes Victoria and SQM files.</p>
        ) : (
          <div className="trends">
            {SERIES.map((x) => {
              const pts = s[type].series[x.key] ?? [];
              const first = pts[0]?.v;
              const last = pts[pts.length - 1]?.v;
              const change = first && last ? ((last - first) / first) * 100 : null;
              return (
                <div className="trend" key={x.key}>
                  <div className="trend__label muted">{x.label}</div>
                  <Sparkline values={pts.map((p) => p.v)} label={`${x.label} over five years`} />
                  <div className="trend__value">
                    {formatValue(x.unit, last)}
                    {change != null && <span className="muted"> {formatValue('pct', change, { signed: true })}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="detail__section">
        <h3>Tram and train access</h3>
        {approxGeometry && <p className="muted note">Based on approximate tram and train alignments, not the official network.</p>}
        <dl className="kv">
          <dt>Within 800 m of a tram stop</dt>
          <dd>{Math.round(s.access.tramShare800 * 100)}% of the suburb</dd>
          <dt>Within 400 m</dt>
          <dd>{Math.round(s.access.tramShare400 * 100)}%</dd>
          <dt>Tram routes</dt>
          <dd>{s.access.tramRoutes.length ? s.access.tramRoutes.join(', ') : 'None'}</dd>
          <dt>Nearest tram stop</dt>
          <dd>{formatDistance(s.access.nearestTramStopM)} from centre</dd>
          <dt>Nearest station</dt>
          <dd>{s.access.nearestStation ? `${s.access.nearestStation.name}, ${formatDistance(s.access.nearestStation.distanceM)}` : '—'}</dd>
          <dt>Train lines</dt>
          <dd>{s.access.trainLines.length ? s.access.trainLines.join(', ') : 'None within 300 m'}</dd>
        </dl>
        {s.access.tramShare800 >= TRAM_SUBURB_SHARE && <p className="note">Counts as a tram suburb.</p>}
      </section>

      <section className="detail__section">
        <h3>Risk flags</h3>
        {!s.overlays && <p className="muted note">Flood, bushfire and heritage overlays aren't loaded yet. They need Vicmap Planning data.</p>}
        {sc.flags.length === 0 ? (
          s.overlays && <p className="muted">No flood, bushfire, heritage, oversupply or apartment-heavy flags.</p>
        ) : (
          <ul className="flags">
            {sc.flags.map((f) => (
              <li key={f.id}>
                <strong>{f.label}</strong>
                <span className="muted">{f.detail}</span>
              </li>
            ))}
          </ul>
        )}
        <dl className="kv kv--compact">
          {s.zones && (
            <>
              <dt>Zoning</dt>
              <dd>
                NRZ {Math.round(s.zones.NRZ * 100)}% · GRZ {Math.round(s.zones.GRZ * 100)}% · RGZ {Math.round(s.zones.RGZ * 100)}%
              </dd>
            </>
          )}
          {s.unitShare != null && s.renterShare != null && (
            <>
              <dt>Apartments / renting</dt>
              <dd>
                {Math.round(s.unitShare * 100)}% flats or apartments · {Math.round(s.renterShare * 100)}% renting
              </dd>
            </>
          )}
        </dl>
      </section>
    </div>
  );
}

function MetricTable({ sc }: { sc: SuburbScore }) {
  const rows = sc.metrics.filter((m) => m.weight > 0 || m.pct == null);
  return (
    <div className="table-wrap">
      <table className="metric-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
            <th title="Percentile across Victorian suburbs, higher is better">Pctl</th>
            <th>Weight</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.key}>
              <td>
                {m.def.label}
                <Provenance mv={m.source ? { value: m.value, source: m.source, asAt: m.asAt ?? '', mock: m.mock, approx: m.approx } : undefined} />
              </td>
              <td>{formatMetric(m.def, m.value, true)}</td>
              <td>{m.pct == null ? 'No data' : Math.round(m.pct)}</td>
              <td>{m.pct == null ? '—' : `${(m.weight * 100).toFixed(1)}%`}</td>
              <td>{m.pct == null ? '—' : m.contribution.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>Composite{sc.penalty ? ` less ${sc.penalty} risk points` : ''}</td>
            <td>{sc.score == null ? '—' : sc.score.toFixed(1)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Provenance({ mv }: { mv: MetricValue | undefined }) {
  if (!mv) return <div className="prov muted">No source</div>;
  if (mv.value == null) return <div className="prov muted">Not enough sales for a reliable figure</div>;
  const src = SOURCES[mv.source];
  const stale = mv.asAt ? isStale(mv.source, mv.asAt) : false;
  return (
    <div className="prov muted" title={src.licence}>
      {src.name}
      {mv.mock ? ' (mock)' : mv.approx ? ' (approximate)' : ''} · as at {formatDate(mv.asAt)}
      {stale && <span className="stale"> · over {src.staleAfterMonths} months old</span>}
    </div>
  );
}
