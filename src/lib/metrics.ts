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

const both: PropertyType[] = ['houses', 'units'];

export const METRICS: MetricDef[] = [
  // Price and rent (context, plus yield inputs)
  { key: 'medianPrice', label: 'Median sale price', short: 'Price', category: null, direction: 'neutral', unit: 'aud', scope: 'type', weight: 0, source: 'yip', types: both, description: 'Median sale price over the last 12 months (Cotality).' },
  { key: 'medianRent', label: 'Median weekly rent', short: 'Rent', category: null, direction: 'neutral', unit: 'audWeekly', scope: 'type', weight: 0, source: 'yip', types: both, description: 'Median advertised weekly rent over the last 12 months (Cotality).' },

  // Yield
  { key: 'grossYield', label: 'Gross rental yield', short: 'Yield', category: 'yield', direction: 'high', unit: 'pct', scope: 'type', weight: 3, source: 'derived', types: both, description: '(Median weekly rent × 52) / median price.' },
  { key: 'priceToIncome', label: 'Price-to-income ratio', short: 'Price/income', category: 'yield', direction: 'low', unit: 'ratio', scope: 'type', weight: 1, source: 'derived', types: both, description: 'Median price / median annual household income (Census).' },

  // Supply
  { key: 'approvalsRatio', label: 'Building approvals ratio', short: 'Approvals', category: 'supply', direction: 'low', unit: 'pct', scope: 'common', weight: 2, source: 'abs-approvals', types: both, description: 'Dwelling approvals in the last 12 months / total dwelling stock.', guide: 'Lower is better. Above ~2.5% hints at future oversupply.' },
  { key: 'stockOnMarket', label: 'Stock on market', short: 'Stock', category: 'supply', direction: 'low', unit: 'pct', scope: 'type', weight: 2, source: 'sqm', types: both, description: 'Active listings / total dwellings.', guide: 'Around 1–1.3% is balanced; lower is tighter.' },
  { key: 'inventoryMonths', label: 'Inventory', short: 'Inventory', category: 'supply', direction: 'low', unit: 'months', scope: 'type', weight: 1.5, source: 'cotality', types: both, description: 'Months to sell current listings at the current sales rate.', guide: 'Under 6 months suggests upward price pressure.' },
  { key: 'supplyTrend', label: 'Stock on market trend', short: 'Stock trend', category: 'supply', direction: 'low', unit: 'pct', scope: 'type', weight: 1.5, source: 'sqm', types: both, description: 'Change in listings over 6 months.', guide: 'Falling stock is a positive signal.' },

  // Demand
  { key: 'vacancy', label: 'Vacancy rate', short: 'Vacancy', category: 'demand', direction: 'low', unit: 'pct', scope: 'common', weight: 2.5, source: 'sqm', types: both, description: 'Share of rental stock vacant.', guide: 'Around 3% is balanced; lower means demand exceeds supply.' },
  { key: 'dom', label: 'Days on market', short: 'DOM', category: 'demand', direction: 'low', unit: 'days', scope: 'type', weight: 1.5, source: 'yip', types: both, description: 'Median days from listing to sale.', guide: 'Under 30 strong, 30–60 balanced, over 90 weak.' },
  { key: 'clearance', label: 'Auction clearance rate', short: 'Clearance', category: 'demand', direction: 'high', unit: 'pct', scope: 'type', weight: 1.5, source: 'domain', types: both, description: 'Share of reported auctions that sold.', guide: 'Above ~65% indicates strong demand.' },
  { key: 'vendorDiscount', label: 'Vendor discounting', short: 'Discount', category: 'demand', direction: 'low', unit: 'pct', scope: 'type', weight: 1, source: 'cotality', types: both, description: 'Average % below initial asking price.' },
  { key: 'domTrend', label: 'Days on market trend', short: 'DOM trend', category: 'demand', direction: 'low', unit: 'days', scope: 'type', weight: 1.5, source: 'cotality', types: both, description: 'Change in days on market over 12 months.', guide: 'Falling days on market plus falling stock is the strongest signal.' },
  { key: 'searchInterest', label: 'Search interest per listing', short: 'Search', category: 'demand', direction: 'high', unit: 'index', scope: 'type', weight: 1, source: 'search-interest', types: both, description: 'Online search interest per listing (licensed feed).' },

  // Growth
  { key: 'growth1y', label: 'Capital growth, 1 year', short: 'Growth 1y', category: 'growth', direction: 'high', unit: 'pct', scope: 'type', weight: 0.5, source: 'yip', types: both, description: 'Change in median price over 1 year.' },
  { key: 'growth3y', label: 'Capital growth, 3 years', short: 'Growth 3y', category: 'growth', direction: 'high', unit: 'pct', scope: 'type', weight: 1, source: 'vgv', types: both, description: 'Change in median price over 3 years (total).' },
  { key: 'growth5y', label: 'Capital growth, 5 years', short: 'Growth 5y', category: 'growth', direction: 'high', unit: 'pct', scope: 'type', weight: 1.5, source: 'vgv', types: both, description: 'Change in median price over 5 years (total).' },
  { key: 'growth10y', label: 'Capital growth, 10 years', short: 'Growth 10y', category: 'growth', direction: 'high', unit: 'pct', scope: 'type', weight: 1.5, source: 'vgv', types: both, description: 'Change in median price over 10 years (total).' },
  { key: 'rentGrowth1y', label: 'Rental growth, 1 year', short: 'Rent 1y', category: 'growth', direction: 'high', unit: 'pct', scope: 'type', weight: 1, source: 'homesvic', types: both, description: 'Change in median rent over 1 year.' },
  { key: 'rentGrowth3y', label: 'Rental growth, 3 years', short: 'Rent 3y', category: 'growth', direction: 'high', unit: 'pct', scope: 'type', weight: 1, source: 'homesvic', types: both, description: 'Change in median rent over 3 years (total).' },

  // Quality and demographics
  { key: 'ownerOccupier', label: 'Owner-occupier ratio', short: 'Owner-occ.', category: 'quality', direction: 'high', unit: 'pct', scope: 'common', weight: 2, source: 'abs-census', types: both, description: 'Share of occupied dwellings owned outright or with a mortgage.', guide: 'Above ~70% is preferred for stability.' },
  { key: 'seifa', label: 'SEIFA IRSAD decile', short: 'SEIFA', category: 'quality', direction: 'high', unit: 'decile', scope: 'common', weight: 1.5, source: 'abs-seifa', types: both, description: 'Index of relative socio-economic advantage and disadvantage, Victorian decile.' },
  { key: 'popGrowth', label: 'Population growth', short: 'Pop. growth', category: 'quality', direction: 'high', unit: 'pct', scope: 'common', weight: 1, source: 'abs-population', types: both, description: 'Annual estimated resident population growth (SA2).' },
  { key: 'distanceCbd', label: 'Distance to CBD', short: 'To CBD', category: 'quality', direction: 'low', unit: 'km', scope: 'common', weight: 1.5, source: 'derived', types: both, description: 'Straight-line distance from the suburb centre to the Melbourne GPO.' },
  { key: 'distanceTrain', label: 'Distance to train', short: 'To train', category: 'quality', direction: 'low', unit: 'km', scope: 'common', weight: 1, source: 'dtp-transport', types: both, description: 'Distance from suburb centroid to the nearest metro train station.' },
  { key: 'nrzShare', label: 'Neighbourhood residential zone', short: 'NRZ share', category: 'quality', direction: 'high', unit: 'pct', scope: 'common', weight: 1, source: 'vicmap-planning', types: both, description: 'Share of residential land zoned NRZ — a proxy for scarcity and limited future density.' },
  { key: 'landToAsset', label: 'Land-to-asset ratio', short: 'Land/asset', category: 'quality', direction: 'high', unit: 'pct', scope: 'type', weight: 1, source: 'vgv', types: ['houses'], description: 'Site value / capital improved value.' },

  // Tram access
  { key: 'tramShare800', label: 'Tram catchment share', short: 'Tram 800 m', category: 'tram', direction: 'high', unit: 'pct', scope: 'common', weight: 1, source: 'dtp-transport', types: both, description: 'Share of suburb area within 800 m of a tram stop.' },

  // Context only
  { key: 'sales12m', label: 'Sales, last 12 months', short: 'Sales', category: null, direction: 'neutral', unit: 'count', scope: 'type', weight: 0, source: 'yip', types: both, description: 'Number of sales over the last 12 months (Cotality). Medians from fewer than 20 sales are left out.' },
  { key: 'medianIncome', label: 'Median household income', short: 'Income', category: null, direction: 'neutral', unit: 'aud', scope: 'common', weight: 0, source: 'abs-census', types: both, description: 'Median annual household income (Census weekly × 52).' },
  { key: 'dwellings', label: 'Total dwellings', short: 'Dwellings', category: null, direction: 'neutral', unit: 'count', scope: 'common', weight: 0, source: 'abs-census', types: both, description: 'Total private dwellings (Census).' },
  { key: 'buildingApprovals', label: 'Building approvals', short: 'Approvals (no.)', category: null, direction: 'neutral', unit: 'count', scope: 'common', weight: 0, source: 'abs-approvals', types: both, description: 'Dwelling approvals in the last 12 months.' },
];

export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.key, m]));

export interface CategoryDef {
  id: CategoryId;
  label: string;
  description: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'yield', label: 'Yield', description: 'Rental return against price.' },
  { id: 'supply', label: 'Supply', description: 'How much new and listed stock competes for buyers.' },
  { id: 'demand', label: 'Demand', description: 'How quickly homes sell and rent.' },
  { id: 'growth', label: 'Growth', description: 'Price and rent momentum.' },
  { id: 'quality', label: 'Quality', description: 'Demographics, amenity and scarcity.' },
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
  'ownerOccupier',
  'seifa',
  'distanceCbd',
  'tramShare800',
];
