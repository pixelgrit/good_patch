# Propa

A heat map of Melbourne suburbs for property investors. Every suburb is coloured by a composite investment score built from the metrics buyers' advocates use — price, yield, supply, demand, momentum, quality and risk — and every score breaks down into its parts with the source and date of each number.

> Scores are a research aid, not financial advice.

The repo ships with **real figures for 69 inner and middle-ring Melbourne suburbs**, collected in October 2026 and stored as plain text in `data/real/` (see "Where the numbers come from" below). Suburb boundaries and the tram and train network are still approximate until you add the official ABS and DTP files to `data/raw/`.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

The built data in `public/data/` is committed, so the app runs without a data build. To refresh it:

```bash
npm run fetch        # download every free source that's due into data/sources/
npm run data         # join sources onto suburbs and write public/data/
npm run refresh      # both
npm run data:mock    # the old mock seed, for testing the UI
npm run test:fetch   # check the spreadsheet and API parsers
npm run build        # typecheck and production build to dist/
```

`npm run fetch -- --all` refetches everything regardless of schedule; `--only=vgv,homesvic` runs named sources. Every source, its publisher, endpoint and update cadence is listed in [docs/data-sources.md](docs/data-sources.md).

### Keeping the data current

`.github/workflows/refresh-data.yml` runs `fetch` and `data` every Monday, checks the app still builds, and commits any changed data. Once the project is in a GitHub repository it runs on its own; trigger it by hand from the Actions tab. A source that fails keeps its last good data, and the job reports the failure after committing whatever did update. Valuer-General's server blocks GitHub, so those files come from the Internet Archive's copy of the same release (see [docs/data-sources.md](docs/data-sources.md#valuer-general-prices-via-the-internet-archive)). GitHub pauses scheduled workflows in repositories with no activity for 60 days, but the weekly data commits count as activity.

`npm run data` flag: `--all-vic` keeps every Victorian suburb rather than just metro Melbourne.

The basemap is a built-in Apple Maps–style light style (`src/lib/basemap.ts`) drawn from OpenStreetMap vector tiles served free by OpenFreeMap: soft land tones, green parks, blue water, yellow motorways and white streets with names, and buildings from zoom 15. Suburb colour sits under the water, roads and labels so the street network reads through it. Set `VITE_MAP_STYLE` in `.env` to use any other MapLibre style instead. If the tiles can't be reached, the map falls back to a plain background.

## What's in the app

- **Map**: opens on Melbourne with the rest of Australia muted. Suburbs are filled on a colour-blind-safe viridis-family ramp (brighter is stronger). Grey means "not enough data" — a suburb missing more than 35% of its weighted inputs is never coloured as if scored.
- **Colour by**: the investment score or any single metric (price, rent, yield, vacancy, days on market, approvals ratio, stock, clearance, growth, owner-occupiers, SEIFA, distance, tram share). For single metrics the colour follows the metric's goodness percentile, so brighter is always better; the legend shows the raw values.
- **Houses / units** switch: every type-specific metric and percentile is computed separately.
- **Strategy presets**: Balanced, Cashflow (yield and vacancy weighted up) and Growth (supply, days-on-market trend, owner-occupiers and SEIFA weighted up). The weights sliders let you set your own mix; the map recolours live. An optional toggle deducts points for risk flags.
- **Hover** shows the score and the two strongest and two weakest factors. **Click** opens the detail panel: key figures with source and "as at" date (flagged when stale), category breakdown, a full metric table (raw value, percentile, weight, points), five-year sparklines, tram and train access, risk flags and zoning.
- **Search** by suburb or postcode.
- **Filters**: budget range, minimum yield, maximum vacancy, maximum distance to CBD, tram suburbs only.
- **Compare**: pin up to four suburbs and view them side by side with price, rent, days-on-market and vacancy trends.
- **Tram toggle**: routes drawn above the choropleth with stops at higher zooms, plus 400 m (light band) and 800 m (hatched) walking catchments. Each suburb's share of area within 800 m of a stop appears in the detail panel, is an optional score factor ("Tram access" weight) and powers the "tram suburbs only" filter (at least 25% of the suburb). A matching train toggle shows lines and stations.
- On mobile the detail panel becomes a bottom sheet and the controls live in a slide-up drawer.

## Scoring model

1. **Percentiles.** For each metric, the build script converts every suburb's raw value to a 0–100 percentile across all suburbs with data, separately for houses and units. The percentile is stored as a *goodness* percentile: for "lower is better" metrics (vacancy, approvals ratio, days on market) it is inverted, so 100 always means best. Ties share a mid-rank. See `applyPercentiles()` in `src/lib/scoring.ts`.
2. **Category scores.** Each category score is the weighted mean of its metrics' percentiles, using the in-category weights below, adjusted by any preset multipliers. Missing metrics are left out of the mean.
3. **Composite.** The composite is the weighted mean of category scores using the preset or slider weights. A metric with no data in any suburb (for example search interest, until a licensed feed is connected) is dropped entirely rather than counted as missing.
4. **Not enough data.** If more than 35% of the planned weight is missing (`MAX_MISSING_SHARE` in `src/lib/presets.ts`), the suburb is shown grey and labelled "not enough data".
5. **Risk penalties (optional).** Flood overlay −5, Bushfire Management Overlay −5, oversupply −8 (approvals ratio above 2.5% with stock on market rising), apartment-heavy −4 (more than 50% units and 55% renters). Heritage overlays are shown but not penalised.
6. **Breakdown.** Each metric's effective weight is `category share × metric share within the available metrics of that category`, so the points column in the detail panel sums exactly to the composite.

### Presets

| Category | Balanced | Cashflow | Growth |
| --- | --- | --- | --- |
| Yield | 20 | 40 | 5 |
| Supply | 20 | 10 | 25 |
| Demand | 20 | 25 | 20 |
| Growth | 20 | 10 | 20 |
| Quality | 20 | 15 | 30 |
| Tram access | 0 | 0 | 0 |

Metric multipliers: Cashflow doubles vacancy and lifts gross yield and 1-year rent growth by 1.5×. Growth doubles days-on-market trend, owner-occupier ratio and SEIFA, and lifts stock trend and approvals ratio by 1.5×.

## Metrics

Default weights are shares within each category under the Balanced preset.

**Yield**

| Metric | Key | Source | Direction | Weight in category | Notes |
| --- | --- | --- | --- | --- | --- |
| Gross rental yield | `grossYield` | Derived | Higher is better | 75% | (Median weekly rent × 52) / median price. |
| Price-to-income ratio | `priceToIncome` | Derived | Lower is better | 25% | Median price / median annual household income (Census). |

**Supply**

| Metric | Key | Source | Direction | Weight in category | Notes |
| --- | --- | --- | --- | --- | --- |
| Building approvals ratio | `approvalsRatio` | ABS Building Approvals (8731.0) | Lower is better | 29% | Dwelling approvals in the last 12 months / total dwelling stock. Lower is better. Above ~2.5% hints at future oversupply. |
| Stock on market | `stockOnMarket` | SQM Research | Lower is better | 29% | Active listings / total dwellings. Around 1–1.3% is balanced; lower is tighter. |
| Inventory | `inventoryMonths` | Cotality | Lower is better | 21% | Months to sell current listings at the current sales rate. Under 6 months suggests upward price pressure. |
| Stock on market trend | `supplyTrend` | SQM Research | Lower is better | 21% | Change in listings over 6 months. Falling stock is a positive signal. |

**Demand**

| Metric | Key | Source | Direction | Weight in category | Notes |
| --- | --- | --- | --- | --- | --- |
| Vacancy rate | `vacancy` | SQM Research | Lower is better | 28% | Share of rental stock vacant. Around 3% is balanced; lower means demand exceeds supply. |
| Days on market | `dom` | Cotality | Lower is better | 17% | Median days from listing to sale. Under 30 strong, 30–60 balanced, over 90 weak. |
| Auction clearance rate | `clearance` | Domain | Higher is better | 17% | Share of reported auctions that sold. Above ~65% indicates strong demand. |
| Vendor discounting | `vendorDiscount` | Cotality | Lower is better | 11% | Average % below initial asking price. |
| Days on market trend | `domTrend` | Cotality | Lower is better | 17% | Change in days on market over 12 months. Falling days on market plus falling stock is the strongest signal. |
| Search interest per listing | `searchInterest` | Search interest feed | Higher is better | 11% | Online search interest per listing (licensed feed). |

**Growth**

| Metric | Key | Source | Direction | Weight in category | Notes |
| --- | --- | --- | --- | --- | --- |
| Capital growth, 1 year | `growth1y` | Valuer-General Victoria median prices | Higher is better | 8% | Change in median price over 1 year. |
| Capital growth, 3 years | `growth3y` | Valuer-General Victoria median prices | Higher is better | 15% | Change in median price over 3 years (total). |
| Capital growth, 5 years | `growth5y` | Valuer-General Victoria median prices | Higher is better | 23% | Change in median price over 5 years (total). |
| Capital growth, 10 years | `growth10y` | Valuer-General Victoria median prices | Higher is better | 23% | Change in median price over 10 years (total). |
| Rental growth, 1 year | `rentGrowth1y` | Homes Victoria Rental Report | Higher is better | 15% | Change in median rent over 1 year. |
| Rental growth, 3 years | `rentGrowth3y` | Homes Victoria Rental Report | Higher is better | 15% | Change in median rent over 3 years (total). |

**Quality**

| Metric | Key | Source | Direction | Weight in category | Notes |
| --- | --- | --- | --- | --- | --- |
| Owner-occupier ratio | `ownerOccupier` | ABS Census 2021 | Higher is better | 22% | Share of occupied dwellings owned outright or with a mortgage. Above ~70% is preferred for stability. |
| SEIFA IRSAD decile | `seifa` | ABS SEIFA 2021 (IRSAD) | Higher is better | 17% | Index of relative socio-economic advantage and disadvantage, Victorian decile. |
| Population growth | `popGrowth` | ABS Regional Population (SA2) | Higher is better | 11% | Annual estimated resident population growth (SA2). |
| Distance to CBD | `distanceCbd` | Derived | Lower is better | 17% | Straight-line distance from suburb centroid to Melbourne GPO. |
| Distance to train | `distanceTrain` | DTP Public Transport Lines and Stops | Lower is better | 11% | Distance from suburb centroid to the nearest metro train station. |
| Neighbourhood residential zone | `nrzShare` | Vicmap Planning (zones and overlays) | Higher is better | 11% | Share of residential land zoned NRZ — a proxy for scarcity and limited future density. |
| Land-to-asset ratio | `landToAsset` | Valuer-General Victoria median prices | Higher is better | 11% | Site value / capital improved value. Houses only. |

**Tram access**

| Metric | Key | Source | Direction | Weight in category | Notes |
| --- | --- | --- | --- | --- | --- |
| Tram catchment share | `tramShare800` | DTP Public Transport Lines and Stops | Higher is better | 100% | Share of suburb area within 800 m of a tram stop. |

**Context (not scored)**

| Metric | Key | Source | Direction | Weight in category | Notes |
| --- | --- | --- | --- | --- | --- |
| Median sale price | `medianPrice` | Valuer-General Victoria median prices | Context only | — | Median sale price over the last 12 months. |
| Median weekly rent | `medianRent` | Homes Victoria Rental Report | Context only | — | Median weekly rent for new lettings, moving annual. |
| Median household income | `medianIncome` | ABS Census 2021 | Context only | — | Median annual household income (Census weekly × 52). |
| Total dwellings | `dwellings` | ABS Census 2021 | Context only | — | Total private dwellings (Census). |
| Building approvals | `buildingApprovals` | ABS Building Approvals (8731.0) | Context only | — | Dwelling approvals in the last 12 months. |

### Data freshness

Each figure is stored as `{ value, source, asAt }`. The UI flags a figure when it is older than its source's cadence: 6 months for market data (prices, rents, listings, vacancy, approvals), 12 months for planning and transport, 18 months for population, and 72 months for Census and SEIFA (which only update every five years). Edit `staleAfterMonths` in `src/lib/sources.ts` to change these.

## Data pipeline

`scripts/build-data/index.ts` runs adapters in three stages and writes everything the app loads to `public/data/`:

1. **Boundaries** — `abs-sal` (ABS SAL 2021, simplified with mapshaper) or approximate Voronoi boundaries.
2. **Transport** — `dtp-transport` (DTP Public Transport Lines and Stops, filtered to `METRO TRAM` and `METRO TRAIN`) or the approximate traced network.
3. **Metrics** — the curated figures in `data/real/` first, then each source file or API in `data/raw/`, which overwrites the values it covers. (`--mock-only` swaps all of this for the mock seed.)

Then it computes geography (distance to CBD and nearest station, tram routes, 400 m and 800 m catchments and each suburb's share within them), derived metrics (gross yield, price-to-income), and percentiles.

| Output | Contents |
| --- | --- |
| `suburbs.json` | One record per suburb: metrics with provenance and percentiles, five-year series, zoning, access, overlays |
| `suburbs.geojson` | Simplified boundaries (code and name only) |
| `suburb-labels.geojson` | Label points |
| `tram-lines.geojson`, `tram-stops.geojson`, `tram-catchment.geojson` | Tram network and catchment bands |
| `train-lines.geojson`, `train-stations.geojson` | Train network |
| `vic-mask.geojson` | Mask that mutes the rest of Australia |

Suburb-level joins use SAL codes for ABS sources (SA2 sources are apportioned with the ABS correspondence file) and normalised suburb names for state sources. The free-source adapters are file based: see `data/raw/README.md` for what to download and the columns each one expects.

### Licensed sources

SQM Research (vacancy, stock on market), Cotality (days on market, inventory, vendor discounting), Domain (auction clearance) and a search-interest feed sit behind adapters in `scripts/build-data/adapters/licensed.ts`. Each reads its key from `.env` (see `.env.example`) and is skipped when the key is absent. The request itself depends on your licence, so `fetchRows()` is a stub per provider: return one row per suburb (or postcode) with the metric values and an `asAt` date, and the adapter handles joining and provenance.

## Adding a data source

1. **Register the source** in `src/lib/sources.ts` (name, licence, URL, how many months before it is stale).
2. **Register any new metric** in `src/lib/metrics.ts`: key, label, category (or `null` for context only), direction, unit, scope (`type` for separate house/unit values, `common` for one value per suburb), weight within its category, and the source. It is picked up by the scoring, the metric table and, if you add it to `MAP_METRICS`, the map selector.
3. **Write an adapter** implementing `Adapter` from `scripts/build-data/adapters/types.ts`. `available()` returns `true` or a reason to skip; `run()` reads the source and calls `setMetric(suburb, key, value, sourceId, asAt, type)` for each value. Use `ctx.byCode` for SAL-coded data or `findByName()` for named data.
4. **Add it to `ADAPTERS`** in `scripts/build-data/index.ts`, after the curated adapters so it overrides them.
5. Run `npm run data`. Percentiles, breakdowns and provenance update automatically.

## Project structure

```
src/
  App.tsx                 layout, data loading
  store.ts                Zustand state (type, view, weights, filters, layers, selection, pins)
  lib/
    metrics.ts            metric registry (direction, weight, source)
    sources.ts            source registry and staleness
    presets.ts            presets, missing-data threshold, risk penalties
    scoring.ts            percentiles, category and composite scores, breakdowns, flags
    colors.ts, format.ts
  hooks/useDerived.ts     memoised scores, filters, map colour values
  components/             MapView, ControlPanel, Search, Legend, HoverCard, DetailPanel, Compare, ui
scripts/build-data/
  index.ts                pipeline
  context.ts              shared helpers (CSV, joins, setMetric)
  adapters/               curated (data/real), open (data/sources), licensed (stubs), mock
scripts/fetch/
  index.ts                runs each source that's due, writes data/sources/manifest.json
  sources/                one fetcher per publisher (ABS, Valuer-General, Homes Victoria, Vicmap, PTV)
  lib/                    HTTP, DataVic catalogue, ArcGIS, ABS SDMX and spreadsheet helpers
  test/                   parser tests
  lib/geo.ts              catchments, access, derived metrics
  mock/                   seed suburbs and approximate transport network
data/real/                hand-collected snapshot (checked in)
data/sources/             normalised output of npm run fetch (checked in)
data/cache/               raw downloads (git-ignored)
data/raw/                 drop source files here (git-ignored)
public/data/              built data the app loads
```

## Where the numbers come from

See [docs/data-sources.md](docs/data-sources.md) for the full catalogue. In short:

- **Prices and growth**: Valuer-General Victoria quarterly medians and yearly time series (automated).
- **Rents and rent growth**: Homes Victoria Rental Report (automated).
- **Approvals and population growth**: ABS Data API at SA2, apportioned to suburbs (automated).
- **Zoning and flood, bushfire and heritage overlays**: Vicmap Planning (automated).
- **Tram and train network**: PTV GTFS Schedule (automated).
- **Boundaries, Census and SEIFA**: ABS, fetched once (they change with each Census).
- **Days on market**: a hand-collected Cotality snapshot for 69 suburbs (`data/real/cotality.txt`), not refreshed automatically.
- **Vacancy, clearance, vendor discounting**: licensed only (SQM, Cotality, Domain); hidden until a key is added.

Until the first `npm run fetch` succeeds, the app uses the hand-collected snapshot in `data/real/` and approximate boundaries and transport lines, labelled "(approximate)" in the app.

**Coverage rule.** A metric is scored only when at least half the suburbs have a value (`MIN_COVERAGE` in `src/lib/scoring.ts`), so a source that covers a few suburbs doesn't skew comparisons. It still appears in the detail panel.

## Licence notes

ABS, Homes Victoria, Valuer-General Victoria, Vicmap and DTP data are published under CC BY 4.0 — keep their attribution if you publish the app. Licensed data must be used under the terms of your agreement with each provider. The Cotality figures in `data/real/cotality.txt` were taken from a public website for personal research; check Cotality's terms before publishing them.
