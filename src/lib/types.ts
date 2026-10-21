export type PropertyType = 'houses' | 'units' | 'land';

export const PROPERTY_TYPES: PropertyType[] = ['houses', 'units', 'land'];
export const TYPE_LABEL: Record<PropertyType, string> = { houses: 'Houses', units: 'Units', land: 'Land' };
/** "No recent {house} sales". */
export const TYPE_SINGULAR: Record<PropertyType, string> = { houses: 'house', units: 'unit', land: 'land' };

export type BedroomRent = 'flat1' | 'flat2' | 'flat3' | 'house2' | 'house3' | 'house4';

export type CategoryId = 'yield' | 'growth' | 'value' | 'supply' | 'demand' | 'location' | 'risk' | 'tram';

export type Direction = 'high' | 'low' | 'neutral';

export type SourceId =
  | 'vgv'
  | 'homesvic'
  | 'abs-census'
  | 'abs-approvals'
  | 'abs-population'
  | 'abs-seifa'
  | 'abs-sal'
  | 'vicmap-planning'
  | 'dtp-transport'
  | 'sqm'
  | 'cotality'
  | 'domain'
  | 'search-interest'
  | 'yip'
  | 'derived'
  | 'mock';

/** Every number in the dataset carries its provenance. */
export interface MetricValue {
  value: number | null;
  source: SourceId;
  /** ISO date the figure is "as at". */
  asAt: string;
  /** Goodness percentile 0–100 across all suburbs with data (higher is better). Written by the build script. */
  pct?: number | null;
  /** True when the figure comes from the mock seed rather than the named source. */
  mock?: boolean;
  /** True when the figure is computed from approximate geometry (traced boundaries or transport lines). */
  approx?: boolean;
}

export interface SeriesPoint {
  /** ISO date (quarter end). */
  t: string;
  v: number;
}

export type SeriesKey = 'price' | 'rent' | 'vacancy' | 'dom';

export interface TypeData {
  metrics: Partial<Record<string, MetricValue>>;
  series: Partial<Record<SeriesKey, SeriesPoint[]>>;
}

export interface ZoneMix {
  NRZ: number;
  GRZ: number;
  RGZ: number;
  other: number;
}

export interface Access {
  tramShare400: number;
  tramShare800: number;
  tramRoutes: string[];
  nearestTramStopM: number | null;
  nearestStation: { name: string; line: string; distanceM: number } | null;
  trainLines: string[];
}

export interface RiskOverlays {
  flood: boolean;
  bushfire: boolean;
  heritage: boolean;
}

export interface Suburb {
  /** ABS SAL 2021 code. */
  code: string;
  name: string;
  /** Postcodes covering at least 10% of the suburb, comma-separated ("3000, 3004"). */
  postcode: string;
  lga: string;
  centroid: [number, number];
  /** Suburb-wide metrics (Census, SEIFA, distance, tram share, vacancy...). */
  common: Partial<Record<string, MetricValue>>;
  houses: TypeData;
  units: TypeData;
  /** Vacant land. */
  land: TypeData;
  /** Planning zone mix; null until Vicmap Planning data is loaded. */
  zones: ZoneMix | null;
  access: Access;
  /** Planning overlays; null until Vicmap Planning data is loaded. */
  overlays: RiskOverlays | null;
  /** Share of dwellings that are flats or apartments (Census), 0–1; null when unknown. */
  unitShare: number | null;
  /** Median weekly rent by bedroom count (Homes Victoria): flat1, flat2, flat3, house2, house3, house4. */
  rentByBedroom?: Partial<Record<BedroomRent, { value: number; asAt: string }>>;
  /** Land area in square kilometres. */
  areaKm2?: number;
  /** Fewer than 100 dwellings per square kilometre: farms, acreage and bush rather than suburban streets. */
  rural?: boolean;
  /** Occupied dwellings by type (Census), shares 0–1: townhouses and semis, and flats by block height. */
  dwellingMix?: { semi: number; lowrise: number; midrise: number; highrise: number } | null;
  /** Share of households renting (Census), 0–1; null when unknown. */
  renterShare: number | null;
}

export interface Dataset {
  generatedAt: string;
  /** True when any metric comes from the mock seed. */
  mock: boolean;
  /** True when boundaries or transport lines are approximate rather than official geometry. */
  approxGeometry?: boolean;
  /** Freshness of each automatically fetched source (from data/sources/manifest.json). */
  sources?: { id: string; name: string; status: string; asAt?: string; fetchedAt: string }[];
  suburbs: Suburb[];
}
