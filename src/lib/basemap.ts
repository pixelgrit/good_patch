import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * A soft, Apple Maps–like basemap drawn from OpenStreetMap data.
 * Tiles: OpenFreeMap (OpenMapTiles schema, free, no key).
 *
 * Layer ids `SUBURB_FILL_BEFORE` and the first symbol layer are the anchors the
 * map uses to slot the choropleth in: suburb fills sit under water, roads and
 * labels, so the street network stays readable through the colour.
 */
export const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

export const SUBURB_FILL_BEFORE = 'water';

const C = {
  land: '#f4f2ed',
  residential: '#f0ede7',
  commercial: '#f6eee6',
  industrial: '#ecebe7',
  hospital: '#f8e4e2',
  school: '#f3edda',
  park: '#d3eac6',
  wood: '#c8e3b8',
  grass: '#dcedcf',
  sand: '#f3ead2',
  water: '#a9d3f2',
  waterLine: '#9ccbee',
  building: '#e7e3dc',
  buildingLine: '#dbd6cd',
  motorway: '#fcd37a',
  motorwayCase: '#e9b552',
  trunk: '#fde7a3',
  trunkCase: '#e8c57a',
  major: '#ffffff',
  majorCase: '#d6d1c6',
  minor: '#ffffff',
  minorCase: '#e1ddd4',
  path: '#d8d3c9',
  rail: '#bfbab1',
  runway: '#e3e0da',
  boundary: '#b7a9c9',
  label: '#3f3e3a',
  labelSoft: '#7b776f',
  roadLabel: '#66625b',
  waterLabel: '#4f88b8',
  halo: 'rgba(255,255,255,0.92)',
};

const REGULAR = ['Noto Sans Regular'];
const BOLD = ['Noto Sans Bold'];
const ITALIC = ['Noto Sans Italic'];

/** Exponential width ramp keyed by zoom. */
const w = (...stops: [number, number][]): ExpressionSpecification =>
  ['interpolate', ['exponential', 1.5], ['zoom'], ...stops.flat()] as unknown as ExpressionSpecification;

const cls = (...classes: string[]): ExpressionSpecification => ['match', ['get', 'class'], classes, true, false] as unknown as ExpressionSpecification;

const notTunnel: ExpressionSpecification = ['!=', ['get', 'brunnel'], 'tunnel'] as unknown as ExpressionSpecification;

interface RoadClass {
  id: string;
  classes: string[];
  fill: string;
  /** Fill opacity. Streets are translucent white, so over a coloured suburb they read as a lighter shade of that suburb. */
  opacity: number;
  /** Casing opacity (a faint dark edge, also translucent so it takes on the suburb's colour). */
  casingOpacity: number;
  casing: string;
  width: [number, number][];
  minzoom: number;
}

const TINT = '#ffffff';
const EDGE = '#2b2a26';

const ROADS: RoadClass[] = [
  { id: 'path', classes: ['path', 'track'], fill: TINT, opacity: 0.35, casing: EDGE, casingOpacity: 0, width: [[14, 0.6], [18, 2]], minzoom: 14 },
  { id: 'service', classes: ['service'], fill: TINT, opacity: 0.35, casing: EDGE, casingOpacity: 0.05, width: [[14, 0.8], [18, 6]], minzoom: 14 },
  { id: 'minor', classes: ['minor'], fill: TINT, opacity: 0.42, casing: EDGE, casingOpacity: 0.06, width: [[12, 0.6], [14, 2.2], [18, 14]], minzoom: 12 },
  { id: 'tertiary', classes: ['tertiary'], fill: TINT, opacity: 0.5, casing: EDGE, casingOpacity: 0.07, width: [[10, 0.6], [13, 2.4], [18, 18]], minzoom: 10 },
  { id: 'secondary', classes: ['secondary'], fill: TINT, opacity: 0.55, casing: EDGE, casingOpacity: 0.08, width: [[9, 0.7], [13, 3], [18, 22]], minzoom: 9 },
  { id: 'primary', classes: ['primary'], fill: TINT, opacity: 0.6, casing: EDGE, casingOpacity: 0.09, width: [[8, 0.8], [13, 3.6], [18, 26]], minzoom: 7 },
  // Freeways keep a softened yellow so main routes still stand out.
  { id: 'trunk', classes: ['trunk'], fill: C.trunk, opacity: 0.7, casing: C.trunkCase, casingOpacity: 0.5, width: [[6, 0.8], [13, 4], [18, 28]], minzoom: 5 },
  { id: 'motorway', classes: ['motorway'], fill: C.motorway, opacity: 0.75, casing: C.motorwayCase, casingOpacity: 0.55, width: [[5, 0.8], [13, 4.4], [18, 30]], minzoom: 4 },
];

function roadLayers(): LayerSpecification[] {
  const casings: LayerSpecification[] = ROADS.filter((r) => r.casingOpacity > 0).map((r) => ({
    id: `road-${r.id}-casing`,
    type: 'line',
    source: 'osm',
    'source-layer': 'transportation',
    minzoom: Math.max(r.minzoom, 11),
    filter: ['all', cls(...r.classes), notTunnel] as unknown as ExpressionSpecification,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': r.casing,
      'line-opacity': r.casingOpacity,
      'line-width': w([11, 0.4], [14, 0.8], [18, 1.5]),
      // Draw the edge outside the street only, so it doesn't darken the tinted fill.
      'line-gap-width': w(...r.width),
    },
  }));
  const fills: LayerSpecification[] = ROADS.map((r) => ({
    id: `road-${r.id}`,
    type: 'line',
    source: 'osm',
    'source-layer': 'transportation',
    minzoom: r.minzoom,
    filter: ['all', cls(...r.classes), notTunnel] as unknown as ExpressionSpecification,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': r.fill,
      'line-opacity': r.opacity,
      'line-width': w(...r.width),
      ...(r.id === 'path' ? { 'line-dasharray': [2, 1.5] } : {}),
    },
  }));
  return [...casings, ...fills];
}

export function appleLikeStyle(): StyleSpecification {
  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': C.land } },

    // Land use and cover
    {
      id: 'landuse',
      type: 'fill',
      source: 'osm',
      'source-layer': 'landuse',
      paint: {
        'fill-color': [
          'match',
          ['get', 'class'],
          'residential',
          C.residential,
          ['commercial', 'retail'],
          C.commercial,
          ['industrial', 'railway', 'garages'],
          C.industrial,
          'hospital',
          C.hospital,
          ['school', 'university', 'college', 'kindergarten'],
          C.school,
          ['cemetery', 'pitch', 'playground', 'stadium'],
          C.grass,
          C.land,
        ],
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 14, 1],
      },
    },
    {
      id: 'landcover',
      type: 'fill',
      source: 'osm',
      'source-layer': 'landcover',
      paint: {
        'fill-color': ['match', ['get', 'class'], 'wood', C.wood, ['grass', 'farmland', 'wetland'], C.grass, 'sand', C.sand, C.grass],
        'fill-opacity': 0.9,
      },
    },
    { id: 'park', type: 'fill', source: 'osm', 'source-layer': 'park', paint: { 'fill-color': C.park, 'fill-opacity': 0.95 } },

    // Water (suburb fills are inserted just before this layer)
    { id: 'water', type: 'fill', source: 'osm', 'source-layer': 'water', filter: notTunnel, paint: { 'fill-color': C.water } },
    {
      id: 'waterway',
      type: 'line',
      source: 'osm',
      'source-layer': 'waterway',
      filter: ['all', notTunnel, cls('river', 'canal', 'stream')] as unknown as ExpressionSpecification,
      paint: { 'line-color': C.waterLine, 'line-width': w([8, 0.5], [13, 1.5], [18, 8]) },
    },

    // Airports
    { id: 'aeroway-area', type: 'fill', source: 'osm', 'source-layer': 'aeroway', filter: ['==', ['geometry-type'], 'Polygon'], minzoom: 10, paint: { 'fill-color': C.industrial } },
    { id: 'aeroway-runway', type: 'line', source: 'osm', 'source-layer': 'aeroway', filter: ['all', ['==', ['geometry-type'], 'LineString'], cls('runway', 'taxiway')] as unknown as ExpressionSpecification, minzoom: 10, paint: { 'line-color': C.runway, 'line-width': w([10, 1], [16, 30]) } },

    // Buildings
    {
      id: 'building',
      type: 'fill',
      source: 'osm',
      'source-layer': 'building',
      minzoom: 14,
      paint: { 'fill-color': C.building, 'fill-outline-color': C.buildingLine, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 1] },
    },

    // Roads and rail
    ...roadLayers(),
    {
      id: 'rail',
      type: 'line',
      source: 'osm',
      'source-layer': 'transportation',
      minzoom: 10,
      filter: ['all', cls('rail', 'transit'), notTunnel] as unknown as ExpressionSpecification,
      paint: { 'line-color': C.rail, 'line-width': w([10, 0.6], [16, 2]), 'line-dasharray': [3, 2] },
    },

    // Boundaries
    {
      id: 'boundary-state',
      type: 'line',
      source: 'osm',
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]] as unknown as ExpressionSpecification,
      paint: { 'line-color': C.boundary, 'line-width': w([3, 0.6], [10, 1.6]), 'line-dasharray': [3, 2] },
    },

    // Labels
    {
      id: 'water-name',
      type: 'symbol',
      source: 'osm',
      'source-layer': 'water_name',
      layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ITALIC, 'text-size': 12, 'text-letter-spacing': 0.1, 'symbol-placement': 'point' },
      paint: { 'text-color': C.waterLabel, 'text-halo-color': 'rgba(169,211,242,0.6)', 'text-halo-width': 1 },
    },
    {
      id: 'road-name',
      type: 'symbol',
      source: 'osm',
      'source-layer': 'transportation_name',
      minzoom: 13,
      filter: cls('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'),
      layout: {
        'symbol-placement': 'line',
        'text-field': ['get', 'name'],
        'text-font': REGULAR,
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 17, 13],
        'text-max-angle': 30,
        'text-padding': 8,
      },
      paint: { 'text-color': C.roadLabel, 'text-halo-color': C.halo, 'text-halo-width': 1.4 },
    },
    {
      id: 'place-neighbourhood',
      type: 'symbol',
      source: 'osm',
      'source-layer': 'place',
      minzoom: 13,
      filter: cls('neighbourhood', 'quarter'),
      layout: { 'text-field': ['get', 'name'], 'text-font': REGULAR, 'text-size': 11, 'text-transform': 'uppercase', 'text-letter-spacing': 0.12 },
      paint: { 'text-color': C.labelSoft, 'text-halo-color': C.halo, 'text-halo-width': 1.2 },
    },
    {
      id: 'place-town',
      type: 'symbol',
      source: 'osm',
      'source-layer': 'place',
      minzoom: 7,
      maxzoom: 12,
      filter: cls('town', 'village'),
      layout: { 'text-field': ['get', 'name'], 'text-font': REGULAR, 'text-size': 12 },
      paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 1.4 },
    },
    {
      id: 'place-city',
      type: 'symbol',
      source: 'osm',
      'source-layer': 'place',
      maxzoom: 11,
      filter: cls('city'),
      layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': BOLD, 'text-size': ['interpolate', ['linear'], ['zoom'], 4, 12, 10, 18] },
      paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 1.6 },
    },
  ];

  return {
    version: 8,
    name: 'Good patch light',
    glyphs: GLYPHS,
    sources: { osm: { type: 'vector', url: TILEJSON_URL } },
    layers,
  };
}
