# How the score works, and why

Good patch ranks suburbs, not individual properties. A suburb score summarises what the public data can say about a suburb's prospects for one buyer goal. It cannot see the condition, block or street of a specific home.

## The method

1. **Percentiles.** Each metric is turned into a 0–100 percentile across Melbourne suburbs, separately for houses and units, and flipped where lower is better, so 100 is always best. Percentiles are robust to outliers and put metrics in different units on one scale.
2. **Categories.** Metrics are grouped into yield, growth, value, supply, demand, location, risk and tram access. A category score is the weighted mean of its metrics' percentiles.
3. **Goal.** The buyer goal ("Buying for") sets how much each category counts and which metrics within a category matter. For example, 1-year growth counts three times as much for a 3–5 year buy-and-sell, and ten-year growth not at all.
4. **Focus.** Balanced, Cashflow or Growth tilts the goal's weights. Moving a slider switches to custom weights.
5. **Small samples.** Growth, value gap and discount to neighbours come from sale medians, which are noisy where few homes sell. For ranking, each suburb's figure is pulled toward the Melbourne median by n / (n + 8), where n is its sales in the latest quarter (empirical-Bayes shrinkage). A suburb with 8 sales is ranked halfway between its own figure and the median; one with 40 sales almost entirely on its own. The figures shown are not changed.
6. **Gaps.** A suburb with no median price for the property type, or missing more than 35% of the weighted inputs, is shown as "not enough data". A metric is only scored when at least 40% of priced suburbs have it.

## What changed in October 2026, and why

The first version weighted "buyers' advocate" indicators equally across five categories. Comparing it with the research on what predicts housing returns turned up four problems:

| Problem | Evidence | Change |
| --- | --- | --- |
| All growth horizons counted the same, whatever the buyer's horizon. | Over one to two years, house price changes keep going in the same direction (momentum). Over longer periods they partly drift back toward fundamentals (Capozza, Hendershott, Mack & Mayer 2002; variance-ratio studies of regional markets). | Each goal weights the horizons differently: short-run momentum for 3–5 year holds, the ten-year record for long holds. |
| Nothing measured whether a suburb is cheap for what it offers. | Prices revert toward fundamentals. Cheaper areas next to dearer ones gain most in booms (Guerrieri, Hartley & Hurst, *Endogenous Gentrification*), and price effects ripple across nearby areas (AHURI 2024). | New **Value** category: price against a fitted model of fundamentals, and discount to suburbs within 4 km. |
| Yield only counted under the Cashflow preset, and wasn't scored at all because coverage fell under 50%. | The rent-to-price ratio predicts total housing returns in most OECD markets (Engsted & Pedersen 2015). | Yield counts in both investor goals. Coverage is now measured against priced suburbs at 40%, and rents missing from Homes Victoria are estimated from the Census median rent (marked approximate). The scaling to today's rents depends on the suburb's apartment share, because Census rent mixes houses and flats. The estimate is typically within 5% where it can be checked. |
| No measure of risk or liquidity. | A 3–5 year hold must cover about 5.5–6% stamp duty plus selling costs, so the ability to sell matters. Price swings raise the chance of having to sell in a dip. | New **Risk** category: price volatility and flood or bushfire overlays. New **turnover** liquidity metric under Demand. |

Some things the research supports were already in the model and stay:

- **Distance to the CBD.** The RBA found Melbourne house prices grew about 0.4 percentage points a year faster for every 10 km closer to the CBD (Kulish, Richards & Gillitzer 2011). It is weighted heavily for long holds and owner-occupiers.
- **Supply constraints.** Where new supply is hard to add, prices rise more when demand grows. NRZ share, land-to-asset ratio and building approvals cover this.
- **Land content.** The land share of a property's value (land leverage) shapes how much its price moves with the market (Bourassa, Hoesli, Scognamiglio & Zhang 2011).

## The three goals

**3–5 year buy and sell.** Momentum (1-year growth ×3), value (room to catch up), demand and liquidity (turnover ×2), and low approvals. Location counts little, because over a few years it is already priced in.

**Long-term investment.** Location 25, yield 20, supply 15, growth 15 (10-year ×2, 1-year ×0.25), risk 10. Scarcity (NRZ ×2, land share ×2) matters most over decades.

**Owner-occupier.** Location 50, value 15 (affordability for local incomes ×1.5), risk 15 (hazard overlays ×2), supply 10, growth 10 (long-run only, as a guide to resale). Yield is left out, and Cashflow focus is not offered.

## The value model

For each property type, log median price is regressed on log household income, SEIFA decile, log distance to the CBD, log distance to a train station, the apartment share, and flood and bushfire overlays. The value gap is the residual as a percentage. The model is refitted on every data build, and the build log prints its R².

Units need more care, because a suburb's unit median can be a studio in a tower or a three-bedroom townhouse. The unit model therefore adds:

- **The suburb's median house price.** This captures land value and amenity the other measures miss. It lifts the fit from R² 0.41 to 0.54.
- **The Census dwelling mix.** Townhouses and semis, and flats in 1–2, 3 and 4+ storey blocks, as shares of occupied dwellings.

Together they lift the unit fit from R² 0.41 to 0.55; most of the gain comes from the house price. The rest of the gap is largely noise from which units happened to sell in the quarter. Suburbs missing an input fall back to the simpler model. The house model fits at about R² 0.67.

A negative gap (cheaper than the model expects) can also reflect something the model can't see, such as a main road, an industrial edge or a new estate without mature amenities. Use it as a prompt to look closer, not as a verdict.

## Units

Besides the value model, three things make unit scores more like-for-like:

- **Rent benchmark.** Homes Victoria's unit benchmark is the 2-bedroom flat. In townhouse suburbs, unit rents are blended with the 2-bedroom house rent in proportion to the townhouse share of units, so yields aren't understated where the median unit is a townhouse.
- **Townhouse share of units** (Supply). Units with their own land carry more land content and face less competing new supply. It is weighted ×2 for long-term holds.
- **High-rise share of units** (Risk). Tower-heavy unit markets carry more oversupply and building-defect risk, and apartments have grown more slowly than houses (about 1.2 points a year slower in the RBA's 1993–2010 comparison).

## Limits

- Some outer hills suburbs (Kalorama, Mount Dandenong, Belgrave) score well for long holds on strong ten-year growth, high SEIFA, settled owner-occupier communities and almost no new building. They also sit under bushfire overlays, which affect insurance and building costs. Turn on "Apply risk penalties" or raise the risk weight if that matters to you.

- Medians move with the mix of homes sold, especially in suburbs with few sales. Volatility partly reflects this sampling noise.
- Census measures (income, owner-occupiers, SEIFA) are from 2021 until the 2026 Census DataPacks are released in 2027.
- Vacancy, listings, days on market and auction results need licensed feeds. They are defined but not scored until one is connected.
- No model predicts suburb returns reliably. The score ranks where the evidence leans, not what will happen.

## Sources

- Capozza, Hendershott, Mack & Mayer, *Determinants of Real House Price Dynamics*, NBER w9262 — https://www.nber.org/papers/w9262
- *Momentum and mean reversion in regional housing markets: evidence from variance ratio tests*, International Journal of Strategic Property Management — https://journals.vilniustech.lt/index.php/IJSPM/article/view/2122
- Engsted & Pedersen, *Predicting returns and rent growth in the housing market using the rent-price ratio: evidence from the OECD countries*, Journal of International Money and Finance 2015 — https://ideas.repec.org/a/eee/jimfin/v53y2015icp257-275.html
- Guerrieri, Hartley & Hurst, *Endogenous Gentrification and Housing Price Dynamics*, NBER w16237 — https://www.chicagobooth.edu/review/what-is-the-key-to-gentrification
- AHURI, *Ripple effect: population changes impact house prices near and far* (2024) — https://www.ahuri.edu.au/sites/default/files/documents/2024-05/PES-421-Ripple-effect-Population-changes-impact-house%20prices-near-and-far.pdf
- Kulish, Richards & Gillitzer, *Urban Structure and Housing Prices: Some Evidence from Australian Cities*, RBA RDP 2011-03 — https://www.rba.gov.au/publications/rdp/2011/2011-03/empirical-evidence.html
- Bourassa, Hoesli, Scognamiglio & Zhang, *Land leverage and house prices*, Regional Science and Urban Economics 2011 — https://ideas.repec.org/a/eee/regeco/v41y2011i2p134-144.html
- Jordà, Knoll, Kuvshinov, Schularick & Taylor, *The Rate of Return on Everything, 1870–2015* — https://www.frbsf.org/research-and-insights/publications/working-papers/the-rate-of-return-on-everything-1870-2015
