import type { PropertyType, Suburb } from './types';

/**
 * Links to current listings on the two big portals, filtered to the suburb and
 * property type. Good patch doesn't copy listings (both sites' terms prohibit
 * scraping); these open the live search on the portal itself.
 */
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

export function listingLinks(s: Suburb, type: PropertyType): ListingLink[] {
  const postcode = s.postcode.split(/,\s*/)[0] ?? '';
  const name = s.name.toLowerCase();
  const rea = `${name.replace(/\s+/g, '+')},+vic+${postcode}`.replace(/\+$/, '');
  const domain = `${name.replace(/\s+/g, '-')}-vic-${postcode}`.replace(/-$/, '');
  return [
    { site: 'realestate.com.au', url: `https://www.realestate.com.au/buy/${REA_TYPE[type]}-in-${rea}/list-1` },
    { site: 'Domain', url: `https://www.domain.com.au/sale/${domain}/?ptype=${DOMAIN_TYPE[type]}` },
  ];
}
