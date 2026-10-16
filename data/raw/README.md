# Manual source files

You normally don't need this folder: `npm run fetch` downloads every free source into `data/sources/` (see `docs/data-sources.md`).

Use it to supply a source by hand, for example when an agency's server is down or you have a licensed extract. A file here is used when the same file name isn't in `data/sources/`, and must use the same normalised columns the fetchers write:

| File | Columns |
| --- | --- |
| `sal-metro.geojson` | Polygons with `code` (SAL 2021 code) and `name` properties |
| `transport-lines.geojson`, `transport-stops.geojson` | `MODE` (`METRO TRAM` / `METRO TRAIN`), `SHORT_NAME`, `LONG_NAME` / `STOP_NAME` |
| `vgv-medians.csv` | `suburb,key,type,median,sales,period_end,series_last_year,median_last_year,median_1y_ago,median_3y_ago,median_5y_ago,median_10y_ago` |
| `homesvic-rents.csv` | `suburb_group,suburb,key,type,median_rent,median_rent_1y_ago,median_rent_3y_ago,as_at` |
| `census-sal.csv` | `SAL_CODE_2021,owner_occupier_share,renter_share,unit_share,median_household_income_weekly,dwellings,as_at` |
| `seifa-sal.csv` | `SAL_CODE_2021,irsad_state_decile,as_at` |
| `approvals-sal.csv` | `SAL_CODE_2021,approvals_12m,as_at` |
| `population-sal.csv` | `SAL_CODE_2021,pop_growth_pct,as_at` |
| `planning-sal.csv` | `SAL_CODE_2021,nrz,grz,rgz,nrz_share_of_residential,flood,bushfire,heritage` |

`type` is `houses` or `units`; `key` is the upper-case suburb name. Files in this folder are git-ignored.
