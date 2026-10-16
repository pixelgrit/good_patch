# Data sources

Every source Propa uses, how it's fetched, how often the publisher updates it, and what it feeds. All automated sources are free and published by government agencies under CC BY 4.0, so keep the attribution if you publish the app.

`npm run fetch` downloads each source that's due, normalises it into `data/sources/`, and records the result in `data/sources/manifest.json`. `npm run data` then joins everything onto suburbs. The scheduled GitHub workflow (`.github/workflows/refresh-data.yml`) runs both every Monday and commits any changes.

## Automated

| Source | Publisher | Endpoint | Publisher updates | Fetcher checks | Feeds |
| --- | --- | --- | --- | --- | --- |
| Median house and unit prices by suburb, quarterly | Valuer-General Victoria (via DataVic) | DataVic catalogue `victorian-property-sales-report-median-house-by-suburb`, `…-median-unit-by-suburb` (XLS) | Quarterly | Monthly | Median price |
| Median house and unit prices by suburb, yearly time series | Valuer-General Victoria (via DataVic) | `…-median-house-by-suburb-time-series`, `…-median-unit-by-suburb-time-series` (XLSX) | Yearly | Monthly | 1, 3, 5 and 10-year growth; price trend |
| Rental Report, moving annual rents by suburb | Homes Victoria (DFFH, via DataVic) | `rental-report-quarterly-moving-annual-rents-by-suburb` (XLSX) | Quarterly | Monthly | Median rent (3-bedroom house, 2-bedroom flat), 1 and 3-year rent growth, rent trend |
| Building Approvals by SA2 | ABS | Data API `ABS,BA_SA2` (data.api.abs.gov.au/rest) (SDMX-CSV) | Monthly | Monthly | Approvals in last 12 months, approvals ratio |
| Estimated Resident Population by SA2 | ABS | Data API `ABS,ABS_ANNUAL_ERP_ASGS2021` | Yearly (March) | Every 2 months | Population growth |
| Planning zones and overlays | Vicmap Planning (DEECA) | WFS `opendata.maps.vic.gov.au/geoserver/wfs`, layers `open-data-platform:plan_zone`, `open-data-platform:plan_overlay` | As planning amendments are gazetted | Monthly | NRZ share, zoning mix; flood (LSIO, FO, SBO), bushfire (BMO) and heritage (HO) flags |
| GTFS Schedule | Department of Transport and Planning | `opendata.transport.vic.gov.au` dataset `gtfs-schedule` (ZIP, about 220 MB) | Weekly | Monthly | Tram and train routes and stops, tram catchments, distance to station |
| Suburbs and Localities (SAL) and SA2 boundaries, ASGS 2021 | ABS | ArcGIS `geo.abs.gov.au/…/ASGS2021/SAL/MapServer/0`, `…/SA2/MapServer/0` | Every 5 years | Once | Suburb boundaries; SA2-to-suburb apportionment |
| SEIFA 2021 by SAL | ABS | ArcGIS `geo.abs.gov.au/…/Hosted/ABS_Socio_Economic_Indexes_for_Areas_SEIFA_by_2021_SAL` | Every 5 years | Once | SEIFA IRSAD decile |
| Census General Community Profile by SAL, Victoria | ABS | DataPack ZIP `…/datapacks/download/{year}_GCP_SAL_for_VIC_short-header.zip` | Every 5 years (2026 Census data due 2027) | Once; tries 2026 first | Owner-occupier share, renter share, apartment share, dwellings, household income |

SA2 figures (approvals, population) are apportioned to suburbs by area overlap: a suburb gets each SA2's count in proportion to how much of that SA2 falls inside it, and a growth rate weighted by how much of the suburb each SA2 covers.

"Fetcher checks" is how often the scheduled job looks for a new release. Fetching is idempotent: an unchanged file produces no commit.

## Run locally: Valuer-General prices

land.vic.gov.au's firewall rejects requests from GitHub's servers (HTTP 403, whatever the client or headers), so the scheduled job skips the Valuer-General fetcher. After each quarterly release (usually about three months after the quarter ends), run it from your own computer and push:

```bash
git pull
npm install
npm run fetch -- --only=vgv
npm run data
git add data/sources public/data
git commit -m "Valuer-General prices"
git push
```

Until it has run once, prices come from the Cotality snapshot for 69 suburbs, and the map shows only suburbs with a price. The app flags the prices as stale six months after their "as at" date.

## Hand-collected snapshot

`data/real/` holds figures collected by hand in October 2026. The automated sources above overwrite them where they overlap.

| File | Source | Still used for |
| --- | --- | --- |
| `cotality.txt` | Cotality, as published on Your Investment Property's suburb pages | Days on market and sales counts for 69 suburbs. Not refreshed automatically: it's a commercial site, and scraping it on a schedule would breach its terms. Covers fewer than half the suburbs once ABS boundaries load, so it's shown but not scored. |
| `census.txt`, `seifa.txt`, `sal-codes.txt` | ABS | Fallback until the first automated run |

## Not available free

These need a paid licence. Adapters with API-key stubs are in `scripts/build-data/adapters/licensed.ts`.

| Metric | Provider | Notes |
| --- | --- | --- |
| Vacancy rate, stock on market, stock trend | SQM Research | Postcode level, monthly. REIV publishes a Melbourne-wide vacancy rate only. |
| Days on market, vendor discounting, inventory | Cotality (formerly CoreLogic), PropTrack | Suburb level |
| Auction clearance rate | Domain, Cotality | Weekly, suburb level |
| Search interest per listing | REA, Domain | Not publicly available |

## Worth adding later

All free, reputable, and suburb-level or finer:

- **Crime Statistics Agency Victoria**: recorded offences by suburb, yearly (XLSX on crimestatistics.vic.gov.au).
- **ACARA My School**: school ICSEA and enrolments (CSV download, yearly).
- **Vicmap Elevation / flood studies**: finer flood risk than overlays, via Vicmap WFS.
- **Victorian Planning Authority / Plan Melbourne**: activity centres and precinct structure plans, a lead indicator for density.
- **ABS Census 2026**: the Census fetcher switches to it automatically when the DataPacks are published.

## When a source fails

Each fetcher checks its own output (for example, at least 200 suburbs parsed, prices in a plausible range) and throws rather than writing doubtful data. A failed source keeps its previous files and is marked `failed` in the manifest. The app's data note shows how many sources failed, and the scheduled job reports the failure after committing whatever did update.

Spreadsheet parsers find columns by header text rather than position, because agencies move columns between releases. If a release changes shape enough to break one, the error names the sheet and what it couldn't find. `npm run test:fetch` runs the parsers against sample workbooks.
