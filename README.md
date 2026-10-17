# Good patch

**Live site:** https://pixelgrit.github.io/good_patch/

A heat map of Melbourne and the surrounding region, out to about two hours' drive, for property buyers and investors. Every suburb is coloured by a composite investment score built for your goal (a 3–5 year buy and sell, a long-term investment or a home to live in) from yield, growth, value, supply, demand, location and risk, and every score breaks down into its parts with the source and date of each number.

> Scores are a research aid, not financial advice.

It covers every suburb and locality whose centre is within 160 km of the Melbourne GPO: metro Melbourne plus Geelong, Ballarat, Bendigo, the Macedon Ranges, the Yarra Valley, Gippsland to Traralgon, and the Bass and Surf coasts. The data refreshes itself every week on GitHub from free government sources (see `docs/data-sources.md`).

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

### Deployment

`.github/workflows/deploy.yml` builds the app and publishes it to the `gh-pages` branch after every push to `main` and after each data refresh, so the site always shows the latest data.

### Keeping the data current

`.github/workflows/refresh-data.yml` runs `fetch` and `data` every Monday, checks the app still builds, and commits any changed data. Once the project is in a GitHub repository it runs on its own; trigger it by hand from the Actions tab. A source that fails keeps its last good data, and the job reports the failure after committing whatever did update. Valuer-General's server blocks GitHub, so those files come from the Internet Archive's copy of the same release (see [docs/data-sources.md](docs/data-sources.md#valuer-general-prices-via-the-internet-archive)). GitHub pauses scheduled workflows in repositories with no activity for 60 days, but the weekly data commits count as activity.


The basemap is a built-in Apple Maps–style light style (`src/lib/basemap.ts`) drawn from OpenStreetMap vector tiles served free by OpenFreeMap: soft land tones, green parks, blue water, yellow motorways and white streets with names, and buildings from zoom 15. Suburb colour sits under the water, roads and labels so the street network reads through it. Set `VITE_MAP_STYLE` in `.env` to use any other MapLibre style instead. If the tiles can't be reached, the map falls back to a plain background.

## What's in the app

- **Map**: opens on Melbourne; zoom out for the region. Localities too quiet for a median price are still shown, so you can open their for-sale links. Suburbs are filled on a colour-blind-safe viridis-family ramp (brighter is stronger). Grey means "not enough data" — a suburb missing more than 35% of its weighted inputs is never coloured as if scored.
- **Colour by**: the investment score or any single metric (price, rent, yield, growth, value gap, discount to neighbours, volatility, turnover, approvals ratio, owner-occupiers, SEIFA, distance, tram share, and vacancy, days on market, stock and clearance when a licensed feed is connected). For single metrics the colour follows the metric's goodness percentile, so brighter is always better; the legend shows the raw values.
- **Houses / units / land** switch: every type-specific metric and percentile is computed separately. Land uses the Valuer-General's median vacant land prices; it earns no rent, so yield drops out and the other categories are reweighted.
- **For sale now**: each suburb's panel links to the live search on realestate.com.au and Domain for that suburb and property type. In rural localities (under 100 dwellings per km²), land searches also include acreage and rural property. Good patch doesn't copy listings: both sites' terms prohibit scraping. Domain offers a paid listings API, which could be added as a licensed source.
- **Buying for**: 3–5 year buy and sell, long-term investment or owner-occupier. Each goal weights the categories and metrics differently (see [docs/scoring.md](docs/scoring.md)).
- **Focus**: Balanced, Cashflow (yield and rent growth weighted up) or Growth (growth, value and supply weighted up), applied on top of the goal. The weights sliders let you set your own mix; the map recolours live. An optional toggle deducts points for risk flags.
- **Hover** shows the score and the two strongest and two weakest factors. **Click** opens the detail panel: key figures with source and "as at" date (flagged when stale), category breakdown, a full metric table (raw value, percentile, weight, points), five-year sparklines, tram and train access, risk flags and zoning.
- **Search** by suburb or postcode.
- **Filters**: budget range, minimum yield, maximum vacancy, maximum distance to CBD, tram suburbs only.
- **Compare**: pin up to four suburbs and view them side by side with price, rent, days-on-market and vacancy trends.
- **Tram toggle**: routes drawn above the choropleth with stops at higher zooms, plus 400 m (light band) and 800 m (hatched) walking catchments. Each suburb's share of area within 800 m of a stop appears in the detail panel, is an optional score factor ("Tram access" weight) and powers the "tram suburbs only" filter (at least 25% of the suburb). A matching train toggle shows lines and stations.
- On mobile the detail panel becomes a bottom sheet and the controls live in a slide-up drawer.

## Scoring model

The method, the research behind it and its limits are written up in [docs/scoring.md](docs/scoring.md).

1. **Percentiles.** For each metric, the build script converts every suburb's raw value to a 0–100 percentile across all suburbs with data, separately for houses and units. The percentile is stored as a *goodness* percentile: for "lower is better" metrics (approvals ratio, volatility, value gap) it is inverted, so 100 always means best. Ties share a mid-rank. See `applyPercentiles()` in `src/lib/scoring.ts`.
1a. **Small samples.** Price-based metrics are ranked on figures pulled toward the median by sales volume (`rankValues()` in `scripts/build-data/lib/geo.ts`), so suburbs with few sales can't top the rankings on noise alone.
2. **Category scores.** Each category score is the weighted mean of its metrics' percentiles, using the in-category weights below adjusted by the goal's and focus's multipliers. Missing metrics are left out of the mean.
3. **Composite.** The composite is the weighted mean of category scores using the goal and focus (or slider) weights. A metric held by fewer than 40% of priced suburbs (`MIN_COVERAGE`) is dropped rather than counted as missing.
4. **Not enough data.** A suburb with no median price for the property type, or missing more than 35% of the planned weight (`MAX_MISSING_SHARE` in `src/lib/presets.ts`), is shown grey and labelled "not enough data".
5. **Risk penalties (optional).** Flood overlay −5, Bushfire Management Overlay −5, oversupply −8 (approvals ratio above 2.5% with stock on market rising), apartment-heavy −4 (more than 50% units and 55% renters). Heritage overlays are shown but not penalised.
6. **Breakdown.** Each metric's effective weight is `category share × metric share within the available metrics of that category`, so the points column in the detail panel sums exactly to the composite.

### Goals and focus

"Buying for" picks the goal; "Focus" tilts it. Category weights by goal (Balanced focus):

| Category | 3–5 year buy and sell | Long-term investment | Owner-occupier |
| --- | --- | --- | --- |
| Yield | 10 | 20 | 0 |
| Growth | 25 | 15 | 10 |
| Value | 25 | 10 | 15 |
| Supply | 15 | 15 | 10 |
| Demand | 15 | 5 | 0 |
| Location | 5 | 25 | 50 |
| Risk | 5 | 10 | 15 |
| Tram access | 0 | 0 | 0 |

- **3–5 year buy and sell** metric multipliers: `growth1y` ×3, `growth3y` ×1.5, `growth5y` ×0.5, `growth10y` ×0, `rentGrowth1y` ×1, `rentGrowth3y` ×0.5, `turnover` ×2, `dom` ×1.5, `ownerOccupier` ×0.5, `hazard` ×0.5.
- **Long-term investment** metric multipliers: `growth1y` ×0.25, `growth3y` ×0.5, `growth5y` ×1, `growth10y` ×2, `rentGrowth1y` ×0.5, `rentGrowth3y` ×1.5, `nrzShare` ×2, `landToAsset` ×2, `townhouseShare` ×2, `highriseShare` ×1.5, `turnover` ×0.
- **Owner-occupier** metric multipliers: `growth1y` ×0, `growth3y` ×0.5, `growth5y` ×1, `growth10y` ×2, `rentGrowth1y` ×0, `rentGrowth3y` ×0, `priceToIncome` ×1.5, `neighbourGap` ×0.5, `ownerOccupier` ×2, `distanceTrain` ×1.5, `hazard` ×2, `approvalsRatio` ×0.5.

Focus tilts (multiplied onto the goal's category weights):

- **Balanced**: no change.
- **Cashflow**: yield ×2, growth ×0.7, location ×0.8; `rentGrowth1y` ×2, `rentGrowth3y` ×2.
- **Growth**: yield ×0.4, growth ×1.4, value ×1.3, supply ×1.3.
- Cashflow is not offered for owner-occupiers.

## Metrics

Weights are the default share within each category, before a goal's multipliers. Metrics from licensed feeds (SQM Research, Cotality, Domain) only count once a key is connected.

**Yield**

| Metric | Key | Source | Direction | Weight in category | Notes |
| --- | --- | --- | --- | --- | --- |
| Gross rental yield | `grossYield` | Derived | Higher is better | 100% | (Median weekly rent × 52) / median price. |

**Growth**

| Metric | Key | Source | Direction | Weight in category | Notes |
| --- | --- | --- | --- | --- | --- |
| Capital growth, 1 year | `growth1y` | Valuer-General Victoria median prices | Higher is better | 20% | Change in median price over 1 year. Short-run momentum: price trends tend to persist for a year or two. |
| Capital growth, 3 years | `growth3y` | Valuer-General Victoria median prices | Higher is better | 20% | Change in median price over 3 years (total). |
| Capital growth, 5 years | `growth5y` | Valuer-General Victoria median prices | Higher is better | 20% | Change in median price over 5 years (total). |
| Capital growth, 10 years | `growth10y` | Valuer-General Victoria median prices | Higher is better | 20% | Change in median price over 10 years (total). A long track record reflects lasting location strengths more than the current cycle. |
| Rental growth, 1 year | `rentGrowth1y` | Homes Victoria Rental Report | Higher is better | 10% | Change in median rent over 1 year. |
| Rental growth, 3 years | `rentGrowth3y` | Homes Victoria Rental Report | Higher is better | 10% | Change in median rent over 3 years (total). |

**Value**

| Metric | Key | Source | Direction | Weight in category | Notes |
| --- | --- | --- | --- | --- | --- |
| Price against fundamentals | `valueGap` | Derived | Lower is better | 44% | How far the median price sits above (+) or below (−) what similar suburbs fetch, given household income, socio-economic standing, distance to the CBD and to a train station, and the share of apartments. Fitted across all suburbs each build. Prices tend to drift back toward fundamentals, so below-model suburbs have more room to catch up. |
| Discount to neighbours | `neighbourGap` | Derived | Higher is better | 33% | How much cheaper (+) or dearer (−) the suburb is than the median of suburbs within 4 km. Cheaper suburbs next to dearer ones tend to gain most in a rising market (the ripple effect). |
| Price-to-income ratio | `priceToIncome` | Derived | Lower is better | 22% | Median price / median annual household income (Census). Lower is more affordable for local buyers. |

**Supply**

| Metric | Key | Source | Direction | Weight in category | Notes |
| --- | --- | --- | --- | --- | --- |
| Building approvals ratio | `approvalsRatio` | ABS Building Approvals (8731.0) | Lower is better | 20% | Dwelling approvals in the last 12 months / total dwelling stock. Lower is better. Above ~2.5% hints at future oversupply. |
| Neighbourhood residential zone | `nrzShare` | Vicmap Planning (zones and overlays) | Higher is better | 10% | Share of residential land zoned NRZ, which limits new density. Where supply is hard to add, prices rise more when demand grows. |
| Land-to-asset ratio | `landToAsset` | Valuer-General Victoria median prices | Higher is better | 10% | Site value / capital improved value. Land appreciates; buildings depreciate. Houses only. |
| Townhouse share of units | `townhouseShare` | ABS Census 2021 | Higher is better | 10% | Townhouses, semis and villas as a share of all units, flats and apartments in the suburb (Census). Units with their own land behave more like houses: more land content, less new competing supply. Houses only. |
| Stock on market | `stockOnMarket` | SQM Research | Lower is better | 20% | Active listings / total dwellings. Around 1–1.3% is balanced; lower is tighter. |
| Inventory | `inventoryMonths` | Cotality | Lower is better | 15% | Months to sell current listings at the current sales rate. Under 6 months suggests upward price pressure. |
| Stock on market trend | `supplyTrend` | SQM Research | Lower is better | 15% | Change in listings over 6 months. Falling stock is a positive signal. |

**Demand**

| Metric | Key | Source | Direction | Weight in category | Notes |
| --- | --- | --- | --- | --- | --- |
| Population growth | `popGrowth` | ABS Regional Population (SA2) | Higher is better | 13% | Annual estimated resident population growth (SA2). |
| Sales turnover | `turnover` | Valuer-General Victoria median prices | Higher is better | 9% | Annualised sales in the latest quarter / total dwellings. A liquid market makes it easier to sell at a fair price when you want to. |
| Vacancy rate | `vacancy` | SQM Research | Lower is better | 22% | Share of rental stock vacant. Around 3% is balanced; lower means demand exceeds supply. |
| Days on market | `dom` | Cotality, via Your Investment Property | Lower is better | 13% | Median days from listing to sale. Under 30 strong, 30–60 balanced, over 90 weak. |
| Auction clearance rate | `clearance` | Domain | Higher is better | 13% | Share of reported auctions that sold. Above ~65% indicates strong demand. |
| Vendor discounting | `vendorDiscount` | Cotality | Lower is better | 9% | Average % below initial asking price. |
| Days on market trend | `domTrend` | Cotality | Lower is better | 13% | Change in days on market over 12 months. Falling days on market plus falling stock is the strongest signal. |
| Search interest per listing | `searchInterest` | Search interest feed | Higher is better | 9% | Online search interest per listing (licensed feed). |

**Location**

| Metric | Key | Source | Direction | Weight in category | Notes |
| --- | --- | --- | --- | --- | --- |
| Distance to CBD | `distanceCbd` | Derived | Lower is better | 36% | Straight-line distance from the suburb centre to the Melbourne GPO. Over decades, Melbourne suburbs closer to the CBD have grown faster. |
| Distance to train | `distanceTrain` | DTP Public Transport Lines and Stops | Lower is better | 18% | Distance from the suburb centre to the nearest train station, metro or V/Line. |
| SEIFA IRSAD decile | `seifa` | ABS SEIFA 2021 (IRSAD) | Higher is better | 27% | Index of relative socio-economic advantage and disadvantage, Victorian decile. |
| Owner-occupier ratio | `ownerOccupier` | ABS Census 2021 | Higher is better | 18% | Share of occupied dwellings owned outright or with a mortgage. Above ~70% suggests a settled community and steady demand. |

**Risk**

| Metric | Key | Source | Direction | Weight in category | Notes |
| --- | --- | --- | --- | --- | --- |
| Price volatility | `volatility` | Valuer-General Victoria median prices | Lower is better | 43% | Standard deviation of yearly changes in the median price over up to 10 years. Steadier prices mean less chance of having to sell in a dip. |
| High-rise share of units | `highriseShare` | ABS Census 2021 | Lower is better | 29% | Flats in blocks of four storeys or more as a share of all units in the suburb (Census). Tower-heavy unit markets carry more oversupply and building-defect risk, and have grown more slowly. Houses only. |
| Flood and bushfire overlays | `hazard` | Vicmap Planning (zones and overlays) | Lower is better | 29% | Number of hazard overlays (flood, bushfire) covering parts of the suburb: 0, 1 or 2. |

**Tram access**

| Metric | Key | Source | Direction | Weight in category | Notes |
| --- | --- | --- | --- | --- | --- |
| Tram catchment share | `tramShare800` | DTP Public Transport Lines and Stops | Higher is better | 100% | Share of suburb area within 800 m of a tram stop. |

**Context (not scored)**

| Metric | Key | Source | Direction | Weight in category | Notes |
| --- | --- | --- | --- | --- | --- |
| Median sale price | `medianPrice` | Valuer-General Victoria median prices | Context only | — | Median sale price for the latest quarter (Valuer-General Victoria). |
| Median weekly rent | `medianRent` | Homes Victoria Rental Report | Context only | — | Moving annual median rent for new leases (Homes Victoria). Where a suburb has no Homes Victoria figure, it is estimated from the Census median rent scaled to today’s rents, and marked approximate. |
| Sales, last 12 months | `sales12m` | Cotality, via Your Investment Property | Context only | — | Number of sales over the last 12 months (Cotality). Medians from fewer than 20 sales are left out. |
| Sales, latest quarter | `salesQuarter` | Valuer-General Victoria median prices | Context only | — | Number of sales in the latest quarter (Valuer-General Victoria). |
| Median household income | `medianIncome` | ABS Census 2021 | Context only | — | Median annual household income (Census weekly × 52). |
| Census median rent | `censusRent` | ABS Census 2021 | Context only | — | Median weekly rent paid by all renting households at the Census. |
| Total dwellings | `dwellings` | ABS Census 2021 | Context only | — | Total private dwellings (Census). |
| Building approvals | `buildingApprovals` | ABS Building Approvals (8731.0) | Context only | — | Dwelling approvals in the last 12 months. |

### Data freshness

Each figure is stored as `{ value, source, asAt }`. The UI flags a figure when it is older than its source's cadence: 6 months for market data (prices, rents, listings, vacancy, approvals), 12 months for planning and transport, 18 months for population, and 72 months for Census and SEIFA (which only update every five years). Edit `staleAfterMonths` in `src/lib/sources.ts` to change these.

## Data pipeline

`scripts/build-data/index.ts` runs adapters in three stages and writes everything the app loads to `public/data/`:

1. **Boundaries** — `abs-sal` (ABS SAL 2021, simplified with mapshaper) or approximate Voronoi boundaries.
2. **Transport** — `dtp-transport` (DTP Public Transport Lines and Stops, filtered to `METRO TRAM` and `METRO TRAIN`) or the approximate traced network.
3. **Metrics** — the curated figures in `data/real/` first, then each source file or API in `data/raw/`, which overwrites the values it covers. (`--mock-only` swaps all of this for the mock seed.)

Then it computes geography (distance to CBD and nearest station, tram routes, 400 m and 800 m catchments and each suburb's share within them), derived metrics (Census-based rent estimates where Homes Victoria has none, gross yield, price-to-income, turnover, the value model and discount to neighbours), and percentiles.

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
    presets.ts            buyer goals, focus tilts, missing-data threshold, risk penalties
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
