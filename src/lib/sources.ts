import type { SourceId } from './types';

export interface SourceInfo {
  id: SourceId;
  name: string;
  licence: string;
  url?: string;
  /** Figures older than this many months are flagged as stale in the UI. */
  staleAfterMonths: number;
  licensed: boolean;
}

export const SOURCES: Record<SourceId, SourceInfo> = {
  vgv: {
    id: 'vgv',
    name: 'Valuer-General Victoria median prices',
    licence: 'CC BY 4.0',
    url: 'https://www.land.vic.gov.au/valuations/resources-and-reports/property-sales-statistics',
    staleAfterMonths: 6,
    licensed: false,
  },
  homesvic: {
    id: 'homesvic',
    name: 'Homes Victoria Rental Report',
    licence: 'CC BY 4.0',
    url: 'https://www.dffh.vic.gov.au/publications/rental-report',
    staleAfterMonths: 6,
    licensed: false,
  },
  'abs-census': {
    id: 'abs-census',
    name: 'ABS Census 2021',
    licence: 'CC BY 4.0',
    url: 'https://www.abs.gov.au/census/find-census-data',
    staleAfterMonths: 72,
    licensed: false,
  },
  'abs-approvals': {
    id: 'abs-approvals',
    name: 'ABS Building Approvals (8731.0)',
    licence: 'CC BY 4.0',
    url: 'https://www.abs.gov.au/statistics/industry/building-and-construction/building-approvals-australia',
    staleAfterMonths: 6,
    licensed: false,
  },
  'abs-population': {
    id: 'abs-population',
    name: 'ABS Regional Population (SA2)',
    licence: 'CC BY 4.0',
    url: 'https://www.abs.gov.au/statistics/people/population/regional-population',
    staleAfterMonths: 18,
    licensed: false,
  },
  'abs-seifa': {
    id: 'abs-seifa',
    name: 'ABS SEIFA 2021 (IRSAD)',
    licence: 'CC BY 4.0',
    url: 'https://www.abs.gov.au/statistics/people/people-and-communities/socio-economic-indexes-areas-seifa-australia',
    staleAfterMonths: 72,
    licensed: false,
  },
  'abs-sal': {
    id: 'abs-sal',
    name: 'ABS ASGS 2021 Suburbs and Localities',
    licence: 'CC BY 4.0',
    url: 'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3',
    staleAfterMonths: 120,
    licensed: false,
  },
  'vicmap-planning': {
    id: 'vicmap-planning',
    name: 'Vicmap Planning (zones and overlays)',
    licence: 'CC BY 4.0',
    url: 'https://www.land.vic.gov.au/maps-and-spatial/spatial-data/vicmap-catalogue/vicmap-planning',
    staleAfterMonths: 12,
    licensed: false,
  },
  'dtp-transport': {
    id: 'dtp-transport',
    name: 'DTP Public Transport Lines and Stops',
    licence: 'CC BY 4.0',
    url: 'https://discover.data.vic.gov.au/dataset/public-transport-lines-and-stops',
    staleAfterMonths: 12,
    licensed: false,
  },
  sqm: {
    id: 'sqm',
    name: 'SQM Research',
    licence: 'Licensed',
    url: 'https://sqmresearch.com.au',
    staleAfterMonths: 6,
    licensed: true,
  },
  cotality: {
    id: 'cotality',
    name: 'Cotality',
    licence: 'Licensed',
    url: 'https://www.cotality.com/au',
    staleAfterMonths: 6,
    licensed: true,
  },
  domain: {
    id: 'domain',
    name: 'Domain',
    licence: 'Licensed',
    url: 'https://developer.domain.com.au',
    staleAfterMonths: 6,
    licensed: true,
  },
  'search-interest': {
    id: 'search-interest',
    name: 'Search interest feed',
    licence: 'Licensed',
    staleAfterMonths: 6,
    licensed: true,
  },
  yip: {
    id: 'yip',
    name: 'Cotality, via Your Investment Property',
    licence: 'Published suburb figures, used for personal research',
    url: 'https://www.yourinvestmentpropertymag.com.au/top-suburbs',
    staleAfterMonths: 6,
    licensed: false,
  },
  derived: {
    id: 'derived',
    name: 'Derived',
    licence: 'Calculated from the sources above',
    staleAfterMonths: 6,
    licensed: false,
  },
  mock: {
    id: 'mock',
    name: 'Mock seed data',
    licence: 'Illustrative only',
    staleAfterMonths: 6,
    licensed: false,
  },
};

export function monthsBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() - a.getDate()) / 30;
}

export function isStale(source: SourceId, asAt: string, now: string = new Date().toISOString()): boolean {
  return monthsBetween(asAt, now) > SOURCES[source].staleAfterMonths;
}
