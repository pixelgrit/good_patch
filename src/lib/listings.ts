import type { PropertyType, Suburb } from './types';

/**
 * Links to current listings on the two big portals, filtered to the suburb and
 * property type. Good patch doesn't copy listings (both sites' terms prohibit
 * scraping); these open the live search on the portal itself.
 */
/** The price slider's range. At the top of the range, searches have no price limit. */
export const LISTING_PRICE_MAX = 10_000_000;
export const LISTING_PRICE_DEFAULT = 1_000_000;
export const LISTING_PRICE_STEP = 50_000;

/** "$850k", "$1.5m", or "Any price" at the top of the range. */
export function formatListingPrice(v: number): string {
  if (v >= LISTING_PRICE_MAX) return 'Any price';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 2).replace(/0$/, '')}m`;
  if (v === 0) return '$0';
  return `$${Math.round(v / 1000)}k`;
}

export interface ListingLink {
  site: string;
  url: string;
}

const REA_TYPE: Record<PropertyType, string> = {
  houses: 'property-house',
  units: 'property-unit+apartment-townhouse-villa',
  land: 'property-land',
};

const DOMAIN_TYPE: Record<PropertyType, string> = {
  houses: 'house',
  units: 'apartment-unit-flat,townhouse,villa',
  land: 'vacant-land',
};

/** In rural localities, land searches also take in acreage and rural property. */
const REA_RURAL_LAND = 'property-land-acreage-rural';
const DOMAIN_RURAL_LAND = 'vacant-land,acreage-semi-rural,rural';

export function listingLinks(s: Suburb, type: PropertyType, maxPrice = LISTING_PRICE_MAX): ListingLink[] {
  const capped = maxPrice < LISTING_PRICE_MAX;
  const ruralLand = type === 'land' && !!s.rural;
  const reaType = ruralLand ? REA_RURAL_LAND : REA_TYPE[type];
  const domainType = ruralLand ? DOMAIN_RURAL_LAND : DOMAIN_TYPE[type];
  const postcode = s.postcode.split(/,\s*/)[0] ?? '';
  const name = s.name.toLowerCase();
  const rea = `${name.replace(/\s+/g, '+')},+vic+${postcode}`.replace(/\+$/, '');
  const domain = `${name.replace(/\s+/g, '-')}-vic-${postcode}`.replace(/-$/, '');
  return [
    { site: 'realestate.com.au', url: `https://www.realestate.com.au/buy/${reaType}${capped ? `-between-0-${maxPrice}` : ''}-in-${rea}/list-1` },
    { site: 'Domain', url: `https://www.domain.com.au/sale/${domain}/?ptype=${domainType}${capped ? `&price=0-${maxPrice}` : ''}` },
  ];
}
