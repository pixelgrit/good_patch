import { Fragment, useState } from 'react';
import { useAbout } from '../hooks/useAbout';
import { useSuburbByCode } from '../hooks/useDerived';
import { formatDate, formatDistance, formatMetric, formatScore, formatValue } from '../lib/format';
import { METRIC_BY_KEY } from '../lib/metrics';
import { FOCUS, GOALS } from '../lib/presets';
import { getMetric, type SuburbScore } from '../lib/scoring';
import { isStale, SOURCES } from '../lib/sources';
import { rampColor } from '../lib/colors';
import { formatListingPrice, LISTING_PRICE_MAX, LISTING_PRICE_STEP, listingLinks } from '../lib/listings';
import { PROPERTY_TYPES, TYPE_LABEL, TYPE_SINGULAR, type BedroomRent, type MetricValue, type PropertyType, type SeriesKey, type Suburb } from '../lib/types';
import { MAX_PINNED, TRAM_SUBURB_SHARE, useStore } from '../store';
import { Pill, Sparkline } from './ui';

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
  const maxPrice = useStore((st) => st.listingMaxPrice);
  const setMaxPrice = useStore((st) => st.setListingMaxPrice);
  const links = listingLinks(s, type, maxPrice);
  const [showAll, setShowAll] = useState(false);
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
        <div className="slider">
          <div className="slider__head">
            <label htmlFor="listing-price">Up to</label>
            <span className="muted">{formatListingPrice(maxPrice)}</span>
          </div>
          <input
            id="listing-price"
            type="range"
            min={0}
            max={LISTING_PRICE_MAX}
            step={LISTING_PRICE_STEP}
            value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
            aria-valuetext={formatListingPrice(maxPrice)}
          />
        </div>
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

      <MarketSnapshot s={s} type={type} />

      <Indicators s={s} type={type} />

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
        <h3>Trends</h3>
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
                  <Sparkline values={pts.map((p) => p.v)} label={`${x.label} since ${pts[0]?.t.slice(0, 4) ?? ''}`} />
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

      <SalesHistory s={s} type={type} />

      <AboutSection s={s} />

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

/** Median sale price by year, and how many sold recently. */
function SalesHistory({ s, type }: { s: Suburb; type: PropertyType }) {
  const pts = s[type].series.price ?? [];
  const quarter = s[type].metrics.salesQuarter;
  const year = s[type].metrics.sales12m;
  if (pts.length < 2 && quarter?.value == null) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const change = first && last && first.v ? ((last.v - first.v) / first.v) * 100 : null;
  const noun = TYPE_SINGULAR[type] === 'land' ? 'land' : `${TYPE_SINGULAR[type]}s`;
  return (
    <section className="detail__section">
      <h3>Sales history</h3>
      {first && last && pts.length > 1 && (
        <p className="note">
          The median {TYPE_SINGULAR[type] === 'land' ? 'vacant land' : TYPE_SINGULAR[type]} price went from {formatValue('aud', first.v)} in {first.t.slice(0, 4)} to {formatValue('aud', last.v)} in {last.t.slice(0, 4)}
          {change != null ? `, ${formatValue('pct', change, { signed: true })}` : ''}.
        </p>
      )}
      <dl className="kv">
        {quarter?.value != null && (
          <>
            <dt>Sold in the latest quarter</dt>
            <dd>
              {quarter.value} {noun} · {formatDate(quarter.asAt)}
            </dd>
          </>
        )}
        {year?.value != null && (
          <>
            <dt>Sold in the last 12 months</dt>
            <dd>
              {year.value} {noun} · {SOURCES[year.source]?.name ?? year.source}
            </dd>
          </>
        )}
        {[...pts].reverse().map((p) => (
          <Fragment key={p.t}>
            <dt>Median, {p.t.slice(0, 4)}</dt>
            <dd>{formatValue('aud', p.v)}</dd>
          </Fragment>
        ))}
      </dl>
      <p className="muted note">Valuer-General Victoria yearly medians. Yearly sale counts aren't published free, so only recent counts are shown.</p>
    </section>
  );
}

/** Facts about the locality, then its description and history from Wikipedia. */
function AboutSection({ s }: { s: Suburb }) {
  const about = useAbout(s.code);
  const value = (k: string) => s.common[k]?.value ?? null;
  const facts: [string, string][] = [];
  if (s.lga) facts.push(['Council', s.lga]);
  if (s.postcode) facts.push([s.postcode.includes(',') ? 'Postcodes' : 'Postcode', s.postcode]);
  if (value('distanceCbd') != null) facts.push(['To the CBD', `${Math.round(value('distanceCbd')!)} km`]);
  if (s.areaKm2 != null) facts.push(['Area', `${s.areaKm2 < 10 ? s.areaKm2.toFixed(1) : Math.round(s.areaKm2)} km²`]);
  if (value('dwellings') != null) facts.push(['Homes', `${Math.round(value('dwellings')!).toLocaleString('en-AU')} (Census 2021)`]);
  if (value('ownerOccupier') != null) facts.push(['Owner-occupied', `${Math.round(value('ownerOccupier')!)}%`]);
  if (s.rural != null) facts.push(['Setting', s.rural ? 'Rural or semi-rural' : 'Suburban or town']);
  const paras = (t: string) =>
    t
      .split(/\n+/)
      .filter(Boolean)
      .map((p, i) => (
        <p className="note" key={i}>
          {p}
        </p>
      ));
  return (
    <>
      <section className="detail__section">
        <h3>About</h3>
        <dl className="kv">
          {facts.map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </Fragment>
          ))}
        </dl>
        {about && paras(about.extract)}
        {about && !about.history && <Attribution title={about.title} url={about.url} />}
      </section>
      {about?.history && (
        <section className="detail__section">
          <h3>History</h3>
          {paras(about.history)}
          <Attribution title={about.title} url={about.url} />
        </section>
      )}
    </>
  );
}

function Attribution({ title, url }: { title: string; url: string }) {
  return (
    <p className="muted note">
      From{' '}
      <a href={url} target="_blank" rel="noopener noreferrer">
        {title} on Wikipedia
      </a>
      , CC BY-SA 4.0.
    </p>
  );
}

/** Headline figures and a by-bedroom table, like a buyer's agent's suburb sheet. */
function MarketSnapshot({ s, type }: { s: Suburb; type: PropertyType }) {
  const v = (k: string) => getMetric(s, type, k)?.value ?? null;
  const chips: [string, string][] = (
    [
      ['Typical', v('medianPrice') != null ? formatValue('aud', v('medianPrice'), { compact: true }) : null],
      ['Rent', v('medianRent') != null ? formatValue('audWeekly', v('medianRent')) : null],
      ['Yield', v('grossYield') != null ? formatValue('pct', v('grossYield')) : null],
      ['Vacancy', v('vacancy') != null ? formatValue('pct', v('vacancy')) : null],
      ['Days on market', v('dom') != null ? formatValue('days', v('dom')) : null],
      ['Rent cover', v('rentCover') != null ? `${Math.round(v('rentCover')!)}%` : null],
    ] as [string, string | null][]
  ).filter((c): c is [string, string] => c[1] != null);
  const beds: [string, BedroomRent][] =
    type === 'units'
      ? [
          ['1 bed', 'flat1'],
          ['2 bed', 'flat2'],
          ['3 bed', 'flat3'],
        ]
      : type === 'houses'
        ? [
            ['2 bed', 'house2'],
            ['3 bed', 'house3'],
            ['4 bed', 'house4'],
          ]
        : [];
  const bedRows = beds.filter(([, k]) => s.rentByBedroom?.[k]);
  if (!chips.length) return null;
  return (
    <section className="detail__section">
      <h3>Market snapshot</h3>
      <div className="pill-row">
        {chips.map(([k, val]) => (
          <span className="pill pill--small pill--static" key={k}>
            {k} {val}
          </span>
        ))}
      </div>
      <div className="table-wrap">
        <table className="metric-table">
          <thead>
            <tr>
              <th />
              <th>Price</th>
              {type !== 'land' && <th>Rent</th>}
              {type !== 'land' && <th>Yield</th>}
              <th>12 months</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>All {TYPE_LABEL[type].toLowerCase()}</td>
              <td>{formatValue('aud', v('medianPrice'), { compact: true })}</td>
              {type !== 'land' && <td>{formatValue('audWeekly', v('medianRent'))}</td>}
              {type !== 'land' && <td>{formatValue('pct', v('grossYield'))}</td>}
              <td>{formatValue('pct', v('growth1y'), { signed: true })}</td>
            </tr>
            {bedRows.map(([label, k]) => (
              <tr key={k}>
                <td>{label}</td>
                <td>—</td>
                <td>{formatValue('audWeekly', s.rentByBedroom![k]!.value)}</td>
                <td>—</td>
                <td>—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted note">
        Prices are Valuer-General medians for all {TYPE_LABEL[type].toLowerCase()}; prices by bedroom aren't published free.{type !== 'land' ? ' Rents by bedroom are Homes Victoria medians for new leases.' : ''}
        {v('rentCover') != null ? ' Rent cover is yield as a share of the RBA investor variable rate: over 100% means the rent covers the interest on a loan for the full price.' : ''}
      </p>
    </section>
  );
}

/** Indicators in the order a buyer's agent reads them, each rated against other suburbs. */
const INDICATORS = [
  'stockOnMarket',
  'inventoryMonths',
  'dom',
  'vacancy',
  'approvalsRatio',
  'vendorDiscount',
  'searchInterest',
  'clearance',
  'seifa',
  'renterShare',
  'unitDwellingShare',
  'unitToHouseValue',
  'priceToIncome',
  'growthVsHistory',
  'valueGap',
  'neighbourGap',
  'turnover',
  'volatility',
  'popGrowth',
  'nrzShare',
  'distanceTrain',
];
/** Measures that only arrive with a licensed feed. */
const LICENSED = ['stockOnMarket', 'inventoryMonths', 'dom', 'vacancy', 'vendorDiscount', 'searchInterest', 'clearance'];

function rating(pct: number | null | undefined): { label: string; tone: 'strong' | 'neutral' | 'weak' } | null {
  if (pct == null) return null;
  if (pct >= 60) return { label: 'Strong', tone: 'strong' };
  if (pct >= 40) return { label: 'Neutral', tone: 'neutral' };
  return { label: 'Weak', tone: 'weak' };
}

function Indicators({ s, type }: { s: Suburb; type: PropertyType }) {
  const rows = INDICATORS.map((k) => {
    const def = METRIC_BY_KEY[k];
    const mv = getMetric(s, type, k);
    // Renter share isn't ranked itself: rate it by the owner-occupier ratio it mirrors.
    const pct = k === 'renterShare' ? getMetric(s, type, 'ownerOccupier')?.pct : mv?.pct;
    return { k, def, mv, r: rating(pct) };
  }).filter((x) => x.def && x.mv?.value != null);
  const missing = LICENSED.filter((k) => getMetric(s, type, k)?.value == null).map((k) => METRIC_BY_KEY[k]?.label.toLowerCase());
  if (!rows.length) return null;
  return (
    <section className="detail__section">
      <h3>Indicators</h3>
      <div className="table-wrap">
        <table className="metric-table">
          <tbody>
            {rows.map(({ k, def, mv, r }) => (
              <tr key={k} title={def.guide ?? def.description}>
                <td>{def.label}</td>
                <td>{formatMetric(def, mv!.value, true)}</td>
                <td>{r && <span className={`rating rating--${r.tone}`}>{r.label}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted note">
        Strong, neutral and weak compare this suburb with the others on the map (top 40%, middle 20%, bottom 40%), allowing for whether higher or lower is better.
        {missing.length ? ` ${missing[0][0].toUpperCase()}${missing.join(', ').slice(1)} need a licensed feed (such as HtAG, SQM Research, Cotality or Domain).` : ''}
      </p>
    </section>
  );
}
