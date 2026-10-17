import type { CategoryId, Direction, PropertyType, SourceId } from './types';

export type Unit = 'aud' | 'audWeekly' | 'pct' | 'ratio' | 'days' | 'months' | 'km' | 'decile' | 'count' | 'index';

export interface MetricDef {
  key: string;
  label: string;
  /** Short label for compact UI. */
  short: string;
  category: CategoryId | null;
  direction: Direction;
  unit: Unit;
  /** 'type' = separate value for houses and units; 'common' = one value per suburb. */
  scope: 'type' | 'common';
  /** Weight within its category (before preset multipliers). */
  weight: number;
  /** Primary source. */
  source: SourceId;
  /** Property types this metric applies to. */
  types: PropertyType[];
  description: string;
  /** Rule of thumb shown in the UI. */
  guide?: string;
}

/** Dwellings that can be rented. */
const both: PropertyType[] = ['houses', 'units'];
/** Houses, units and vacant land. */
const all: PropertyType[] = ['houses', 'units', 'land'];

export const METRICS: MetricDef[] = [
  // Price and rent (context, plus yield inputs)
  { key: 'medianPrice', label: 'Median sale price', short: 'Price', category: null, direction: 'neutral', unit: 'aud', scope: 'type', weight: 0, source: 'vgv', types: all, description: 'Median sale price for the latest quarter (Valuer-General Victoria).' },
  { key: 'medianRent', label: 'Median weekly rent', short: 'Rent', category: null, direction: 'neutral', unit: 'audWeekly', scope: 'type', weight: 0, source: 'homesvic', types: both, description: 'Moving annual median rent for new leases (Homes Victoria). Where a suburb has no Homes Victoria figure, it is estimated from the Census median rent scaled to today’s rents, and marked approximate.' },

  // Yield: the rent-to-price ratio, which research finds predicts total returns
  { key: 'grossYield', label: 'Gross rental yield', short: 'Yield', category: 'yield', direction: 'high', unit: 'pct', scope: 'type', weight: 1, source: 'derived', types: both, description: '(Median weekly rent × 52) / median price.' },

  // Growth: price and rent momentum over different horizons
  { key: 'growth1y', label: 'Capital growth, 1 year', short: 'Growth 1y', category: 'growth', direction: 'high', unit: 'pct', scope: 'type', weight: 1, source: 'vgv', types: all, description: 'Change in median price over 1 year.', guide: 'Short-run momentum: price trends tend to persist for a year or two.' },
  { key: 'growth3y', label: 'Capital growth, 3 years', short: 'Growth 3y', category: 'growth', direction: 'high', unit: 'pct', scope: 'type', weight: 1, source: 'vgv', types: all, description: 'Change in median price over 3 years (total).' },
  { key: 'growth5y', label: 'Capital growth, 5 years', short: 'Growth 5y', category: 'growth', direction: 'high', unit: 'pct', scope: 'type', weight: 1, source: 'vgv', types: all, description: 'Change in median price over 5 years (total).' },
  { key: 'growth10y', label: 'Capital growth, 10 years', short: 'Growth 10y', category: 'growth', direction: 'high', unit: 'pct', scope: 'type', weight: 1, source: 'vgv', types: all, description: 'Change in median price over 10 years (total).', guide: 'A long track record reflects lasting location strengths more than the current cycle.' },
  { key: 'rentGrowth1y', label: 'Rental growth, 1 year', short: 'Rent 1y', category: 'growth', direction: 'high', unit: 'pct', scope: 'type', weight: 0.5, source: 'homesvic', types: both, description: 'Change in median rent over 1 year.' },
  { key: 'rentGrowth3y', label: 'Rental growth, 3 years', short: 'Rent 3y', category: 'growth', direction: 'high', unit: 'pct', scope: 'type', weight: 0.5, source: 'homesvic', types: both, description: 'Change in median rent over 3 years (total).' },

  // Value: is the suburb cheap for what it offers?
  { key: 'valueGap', label: 'Price against fundamentals', short: 'Value gap', category: 'value', direction: 'low', unit: 'pct', scope: 'type', weight: 2, source: 'derived', types: all, description: 'How far the median price sits above (+) or below (−) what similar suburbs fetch, given household income, socio-economic standing, distance to the CBD and to a train station, and the share of apartments. Fitted across all suburbs each build.', guide: 'Prices tend to drift back toward fundamentals, so below-model suburbs have more room to catch up.' },
  { key: 'neighbourGap', label: 'Discount to neighbours', short: 'Neighbour gap', category: 'value', direction: 'high', unit: 'pct', scope: 'type', weight: 1.5, source: 'derived', types: all, description: 'How much cheaper (+) or dearer (−) the suburb is than the median of suburbs within 4 km.', guide: 'Cheaper suburbs next to dearer ones tend to gain most in a rising market (the ripple effect).' },
  { key: 'priceToIncome', label: 'Price-to-income ratio', short: 'Price/income', category: 'value', direction: 'low', unit: 'ratio', scope: 'type', weight: 1, source: 'derived', types: all, description: 'Median price / median annual household income (Census).', guide: 'Lower is more affordable for local buyers.' },

  // Supply
  { key: 'approvalsRatio', label: 'Building approvals ratio', short: 'Approvals', category: 'supply', direction: 'low', unit: 'pct', scope: 'common', weight: 2, source: 'abs-approvals', types: all, description: 'Dwelling approvals in the last 12 months / total dwelling stock.', guide: 'Lower is better. Above ~2.5% hints at future oversupply.' },
  { key: 'nrzShare', label: 'Neighbourhood residential zone', short: 'NRZ share', category: 'supply', direction: 'high', unit: 'pct', scope: 'common', weight: 1, source: 'vicmap-planning', types: all, description: 'Share of residential land zoned NRZ, which limits new density.', guide: 'Where supply is hard to add, prices rise more when demand grows.' },
  { key: 'landToAsset', label: 'Land-to-asset ratio', short: 'Land/asset', category: 'supply', direction: 'high', unit: 'pct', scope: 'type', weight: 1, source: 'vgv', types: ['houses'], description: 'Site value / capital improved value.', guide: 'Land appreciates; buildings depreciate.' },
  { key: 'townhouseShare', label: 'Townhouse share of units', short: 'Townhouses', category: 'supply', direction: 'high', unit: 'pct', scope: 'type', weight: 1, source: 'abs-census', types: ['units'], description: 'Townhouses, semis and villas as a share of all units, flats and apartments in the suburb (Census).', guide: 'Units with their own land behave more like houses: more land content, less new competing supply.' },
  { key: 'stockOnMarket', label: 'Stock on market', short: 'Stock', category: 'supply', direction: 'low', unit: 'pct', scope: 'type', weight: 2, source: 'sqm', types: both, description: 'Active listings / total dwellings.', guide: 'Around 1–1.3% is balanced; lower is tighter.' },
  { key: 'inventoryMonths', label: 'Inventory', short: 'Inventory', category: 'supply', direction: 'low', unit: 'months', scope: 'type', weight: 1.5, source: 'cotality', types: both, description: 'Months to sell current listings at the current sales rate.', guide: 'Under 6 months suggests upward price pressure.' },
  { key: 'supplyTrend', label: 'Stock on market trend', short: 'Stock trend', category: 'supply', direction: 'low', unit: 'pct', scope: 'type', weight: 1.5, source: 'sqm', types: both, description: 'Change in listings over 6 months.', guide: 'Falling stock is a positive signal.' },

  // Demand and liquidity
  { key: 'popGrowth', label: 'Population growth', short: 'Pop. growth', category: 'demand', direction: 'high', unit: 'pct', scope: 'common', weight: 1.5, source: 'abs-population', types: all, description: 'Annual estimated resident population growth (SA2).' },
  { key: 'turnover', label: 'Sales turnover', short: 'Turnover', category: 'demand', direction: 'high', unit: 'pct', scope: 'common', weight: 1, source: 'vgv', types: both, description: 'Annualised sales in the latest quarter / total dwellings.', guide: 'A liquid market makes it easier to sell at a fair price when you want to.' },
  { key: 'vacancy', label: 'Vacancy rate', short: 'Vacancy', category: 'demand', direction: 'low', unit: 'pct', scope: 'common', weight: 2.5, source: 'sqm', types: both, description: 'Share of rental stock vacant.', guide: 'Around 3% is balanced; lower means demand exceeds supply.' },
  { key: 'dom', label: 'Days on market', short: 'DOM', category: 'demand', direction: 'low', unit: 'days', scope: 'type', weight: 1.5, source: 'yip', types: both, description: 'Median days from listing to sale.', guide: 'Under 30 strong, 30–60 balanced, over 90 weak.' },
  { key: 'clearance', label: 'Auction clearance rate', short: 'Clearance', category: 'demand', direction: 'high', unit: 'pct', scope: 'type', weight: 1.5, source: 'domain', types: both, description: 'Share of reported auctions that sold.', guide: 'Above ~65% indicates strong demand.' },
  { key: 'vendorDiscount', label: 'Vendor discounting', short: 'Discount', category: 'demand', direction: 'low', unit: 'pct', scope: 'type', weight: 1, source: 'cotality', types: both, description: 'Average % below initial asking price.' },
  { key: 'domTrend', label: 'Days on market trend', short: 'DOM trend', category: 'demand', direction: 'low', unit: 'days', scope: 'type', weight: 1.5, source: 'cotality', types: both, description: 'Change in days on market over 12 months.', guide: 'Falling days on market plus falling stock is the strongest signal.' },
  { key: 'searchInterest', label: 'Search interest per listing', short: 'Search', category: 'demand', direction: 'high', unit: 'index', scope: 'type', weight: 1, source: 'search-interest', types: both, description: 'Online search interest per listing (licensed feed).' },

  // Location and amenity
  { key: 'distanceCbd', label: 'Distance to CBD', short: 'To CBD', category: 'location', direction: 'low', unit: 'km', scope: 'common', weight: 2, source: 'derived', types: all, description: 'Straight-line distance from the suburb centre to the Melbourne GPO.', guide: 'Over decades, Melbourne suburbs closer to the CBD have grown faster.' },
  { key: 'distanceTrain', label: 'Distance to train', short: 'To train', category: 'location', direction: 'low', unit: 'km', scope: 'common', weight: 1, source: 'dtp-transport', types: all, description: 'Distance from the suburb centre to the nearest train station, metro or V/Line.' },
  { key: 'seifa', label: 'SEIFA IRSAD decile', short: 'SEIFA', category: 'location', direction: 'high', unit: 'decile', scope: 'common', weight: 1.5, source: 'abs-seifa', types: all, description: 'Index of relative socio-economic advantage and disadvantage, Victorian decile.' },
  { key: 'ownerOccupier', label: 'Owner-occupier ratio', short: 'Owner-occ.', category: 'location', direction: 'high', unit: 'pct', scope: 'common', weight: 1, source: 'abs-census', types: all, description: 'Share of occupied dwellings owned outright or with a mortgage.', guide: 'Above ~70% suggests a settled community and steady demand.' },

  // Risk
  { key: 'volatility', label: 'Price volatility', short: 'Volatility', category: 'risk', direction: 'low', unit: 'pct', scope: 'type', weight: 1.5, source: 'vgv', types: all, description: 'Standard deviation of yearly changes in the median price over up to 10 years.', guide: 'Steadier prices mean less chance of having to sell in a dip.' },
  { key: 'highriseShare', label: 'High-rise share of units', short: 'High-rise', category: 'risk', direction: 'low', unit: 'pct', scope: 'type', weight: 1, source: 'abs-census', types: ['units'], description: 'Flats in blocks of four storeys or more as a share of all units in the suburb (Census).', guide: 'Tower-heavy unit markets carry more oversupply and building-defect risk, and have grown more slowly.' },
  { key: 'hazard', label: 'Flood and bushfire overlays', short: 'Hazards', category: 'risk', direction: 'low', unit: 'count', scope: 'common', weight: 1, source: 'vicmap-planning', types: all, description: 'Number of hazard overlays (flood, bushfire) covering parts of the suburb: 0, 1 or 2.' },

  // Tram access
  { key: 'tramShare800', label: 'Tram catchment share', short: 'Tram 800 m', category: 'tram', direction: 'high', unit: 'pct', scope: 'common', weight: 1, source: 'dtp-transport', types: all, description: 'Share of suburb area within 800 m of a tram stop.' },

  // Context only
  { key: 'sales12m', label: 'Sales, last 12 months', short: 'Sales', category: null, direction: 'neutral', unit: 'count', scope: 'type', weight: 0, source: 'yip', types: both, description: 'Number of sales over the last 12 months (Cotality). Medians from fewer than 20 sales are left out.' },
  { key: 'salesQuarter', label: 'Sales, latest quarter', short: 'Sales (qtr)', category: null, direction: 'neutral', unit: 'count', scope: 'type', weight: 0, source: 'vgv', types: all, description: 'Number of sales in the latest quarter (Valuer-General Victoria).' },
  { key: 'medianIncome', label: 'Median household income', short: 'Income', category: null, direction: 'neutral', unit: 'aud', scope: 'common', weight: 0, source: 'abs-census', types: all, description: 'Median annual household income (Census weekly × 52).' },
  { key: 'censusRent', label: 'Census median rent', short: 'Census rent', category: null, direction: 'neutral', unit: 'audWeekly', scope: 'common', weight: 0, source: 'abs-census', types: all, description: 'Median weekly rent paid by all renting households at the Census.' },
  { key: 'dwellings', label: 'Total dwellings', short: 'Dwellings', category: null, direction: 'neutral', unit: 'count', scope: 'common', weight: 0, source: 'abs-census', types: all, description: 'Total private dwellings (Census).' },
  { key: 'buildingApprovals', label: 'Building approvals', short: 'Approvals (no.)', category: null, direction: 'neutral', unit: 'count', scope: 'common', weight: 0, source: 'abs-approvals', types: all, description: 'Dwelling approvals in the last 12 months.' },
];

export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.key, m]));

export interface CategoryDef {
  id: CategoryId;
  label: string;
  description: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'yield', label: 'Yield', description: 'Rent against price, the income part of the return.' },
  { id: 'growth', label: 'Growth', description: 'Price and rent momentum.' },
  { id: 'value', label: 'Value', description: 'Price against fundamentals and against neighbouring suburbs.' },
  { id: 'supply', label: 'Supply', description: 'New building, zoning limits and land content.' },
  { id: 'demand', label: 'Demand', description: 'Population growth and how readily homes sell.' },
  { id: 'location', label: 'Location', description: 'Distance to the CBD and trains, socio-economic standing, settled community.' },
  { id: 'risk', label: 'Risk', description: 'Price volatility and flood or bushfire overlays.' },
  { id: 'tram', label: 'Tram access', description: 'Optional: share of the suburb near a tram stop.' },
];

/** Metrics offered in the map's metric selector. */
export const MAP_METRICS = [
  'medianPrice',
  'medianRent',
  'grossYield',
  'vacancy',
  'dom',
  'approvalsRatio',
  'stockOnMarket',
  'clearance',
  'growth5y',
  'valueGap',
  'neighbourGap',
  'volatility',
  'turnover',
  'ownerOccupier',
  'seifa',
  'distanceCbd',
  'tramShare800',
];
