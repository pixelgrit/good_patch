import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, LayerSpecification, MapLayerMouseEvent, MapMouseEvent, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Bundle the MapLibre worker with Vite so it resolves in dev and production.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { NO_DATA, RAMP } from '../lib/colors';
import type { SuburbScore } from '../lib/scoring';
import { useStore } from '../store';
import type { MapValues } from '../hooks/useDerived';
import { HoverCard } from './HoverCard';
import { appleLikeStyle, SUBURB_FILL_BEFORE, TILEJSON_URL } from '../lib/basemap';

maplibregl.setWorkerUrl(workerUrl);

const DATA = `${import.meta.env.BASE_URL}data/`;
/** Optional override: any MapLibre style URL. Without it the built-in OpenStreetMap style is used. */
const STYLE_URL: string | undefined = import.meta.env.VITE_MAP_STYLE || undefined;

const MELBOURNE: [[number, number], [number, number]] = [
  [144.83, -37.93],
  [145.16, -37.7],
];

const MELBOURNE_MOBILE: [[number, number], [number, number]] = [
  [144.9, -37.9],
  [145.07, -37.73],
];

/** Plain fallback when the basemap can't be reached (offline, blocked). */
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#ece9e1' } }],
};

const INK = '#1c1c1a';

async function fetchWithTimeout(url: string, ms = 5000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function loadStyle(): Promise<{ style: StyleSpecification; basemap: boolean }> {
  try {
    if (STYLE_URL) return { style: (await (await fetchWithTimeout(STYLE_URL)).json()) as StyleSpecification, basemap: true };
    // Check the OpenStreetMap tile service is reachable before committing to it.
    await fetchWithTimeout(TILEJSON_URL);
    return { style: appleLikeStyle(), basemap: true };
  } catch {
    console.warn('Basemap unavailable, using plain background.');
    return { style: FALLBACK_STYLE, basemap: false };
  }
}

function hatchImage(): { width: number; height: number; data: Uint8Array } {
  const size = 8;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x + y) % size === 0 || (x + y + 1) % size === 0) {
        const i = (y * size + x) * 4;
        data[i] = 28;
        data[i + 1] = 28;
        data[i + 2] = 26;
        data[i + 3] = 60;
      }
    }
  }
  return { width: size, height: size, data };
}

const rampExpr: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['coalesce', ['feature-state', 't'], 0],
  ...RAMP.flatMap(([t, c]) => [t, c]),
] as unknown as ExpressionSpecification;

interface Props {
  values: MapValues;
  scores: Map<string, SuburbScore>;
  visible: Set<string>;
}

export function MapView({ values, scores, visible }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const geoRef = useRef<FeatureCollection<Polygon | MultiPolygon, { code: string; name: string }> | null>(null);
  const [ready, setReady] = useState(false);
  const [hoverPt, setHoverPt] = useState<{ x: number; y: number } | null>(null);

  const layers = useStore((s) => s.layers);
  const selected = useStore((s) => s.selected);
  const pinned = useStore((s) => s.pinned);
  const hovered = useStore((s) => s.hovered);
  const flyTo = useStore((s) => s.flyTo);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ style, basemap }, suburbs] = await Promise.all([loadStyle(), fetch(`${DATA}suburbs.geojson`).then((r) => r.json())]);
      if (cancelled || !container.current) return;
      geoRef.current = suburbs;
      const map = new maplibregl.Map({
        container: container.current,
        style,
        bounds: window.innerWidth < 760 ? MELBOURNE_MOBILE : MELBOURNE,
        fitBoundsOptions: {
          padding: window.innerWidth < 760 ? { top: 120, bottom: 60, left: 10, right: 10 } : { top: 40, bottom: 60, left: 380, right: 40 },
        },
        maxBounds: [
          [105, -48],
          [165, -5],
        ],
        minZoom: 3.2,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      mapRef.current = map;

      map.on('load', () => {
        const styleLayers: LayerSpecification[] = map.getStyle().layers ?? [];
        const firstSymbol = styleLayers.find((l) => l.type === 'symbol')?.id;
        const hasGlyphs = !!map.getStyle().glyphs;
        // Suburb colour sits under water, roads and labels when there is a basemap.
        const fillBefore = map.getLayer(SUBURB_FILL_BEFORE) ? SUBURB_FILL_BEFORE : firstSymbol;
        const fillOpacity = basemap ? 0.72 : 0.8;

        map.addImage('hatch', hatchImage(), { pixelRatio: 2 });

        map.addSource('vic-mask', { type: 'geojson', data: `${DATA}vic-mask.geojson` });
        map.addSource('suburbs', { type: 'geojson', data: suburbs, promoteId: 'code' });
        map.addSource('labels', { type: 'geojson', data: `${DATA}suburb-labels.geojson` });
        map.addSource('tram-lines', { type: 'geojson', data: `${DATA}tram-lines.geojson` });
        map.addSource('tram-stops', { type: 'geojson', data: `${DATA}tram-stops.geojson` });
        map.addSource('tram-catchment', { type: 'geojson', data: `${DATA}tram-catchment.geojson` });
        map.addSource('train-lines', { type: 'geojson', data: `${DATA}train-lines.geojson` });
        map.addSource('train-stations', { type: 'geojson', data: `${DATA}train-stations.geojson` });

        map.addLayer({ id: 'vic-mask', type: 'fill', source: 'vic-mask', paint: { 'fill-color': '#f6f4ef', 'fill-opacity': 0.55 } }, fillBefore);

        map.addLayer(
          {
            id: 'suburbs-fill',
            type: 'fill',
            source: 'suburbs',
            paint: {
              'fill-color': ['case', ['boolean', ['feature-state', 'nodata'], false], NO_DATA, rampExpr] as ExpressionSpecification,
              'fill-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.1, fillOpacity],
            },
          },
          fillBefore,
        );
        map.addLayer(
          {
            id: 'suburbs-casing',
            type: 'line',
            source: 'suburbs',
            layout: { 'line-join': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.6, 12, 3, 15, 5], 'line-opacity': 0.9 },
          },
          firstSymbol,
        );
        map.addLayer(
          {
            id: 'suburbs-line',
            type: 'line',
            source: 'suburbs',
            layout: { 'line-join': 'round' },
            paint: {
              'line-color': INK,
              'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.9, 12, 1.4, 15, 2],
              'line-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.3, 0.85],
            },
          },
          firstSymbol,
        );

        map.addLayer(
          { id: 'tram-catchment-800', type: 'fill', source: 'tram-catchment', filter: ['==', ['get', 'band'], 800], layout: { visibility: 'none' }, paint: { 'fill-pattern': 'hatch' } },
          firstSymbol,
        );
        map.addLayer(
          { id: 'tram-catchment-400', type: 'fill', source: 'tram-catchment', filter: ['==', ['get', 'band'], 400], layout: { visibility: 'none' }, paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.16 } },
          firstSymbol,
        );

        map.addLayer(
          {
            id: 'train-lines',
            type: 'line',
            source: 'train-lines',
            layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': INK, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 15, 3], 'line-dasharray': [2, 1.5] },
          },
          firstSymbol,
        );

        map.addLayer(
          {
            id: 'tram-casing',
            type: 'line',
            source: 'tram-lines',
            layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 7] },
          },
          firstSymbol,
        );
        map.addLayer(
          {
            id: 'tram-lines',
            type: 'line',
            source: 'tram-lines',
            layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': INK, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.4, 15, 3.5] },
          },
          firstSymbol,
        );

        map.addLayer(
          {
            id: 'suburbs-highlight',
            type: 'line',
            source: 'suburbs',
            paint: {
              'line-color': INK,
              'line-width': [
                'case',
                ['boolean', ['feature-state', 'selected'], false],
                3,
                ['boolean', ['feature-state', 'hover'], false],
                2,
                ['boolean', ['feature-state', 'pinned'], false],
                1.6,
                0,
              ],
              'line-dasharray': ['case', ['boolean', ['feature-state', 'pinned'], false], ['literal', [2, 1]], ['literal', [1, 0]]],
            },
          },
          firstSymbol,
        );

        map.addLayer({
          id: 'tram-stops',
          type: 'circle',
          source: 'tram-stops',
          minzoom: 13,
          layout: { visibility: 'none' },
          paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2, 16, 4], 'circle-color': '#ffffff', 'circle-stroke-color': INK, 'circle-stroke-width': 1.2 },
        });
        map.addLayer({
          id: 'train-stations',
          type: 'circle',
          source: 'train-stations',
          minzoom: 11,
          layout: { visibility: 'none' },
          paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 16, 6], 'circle-color': '#ffffff', 'circle-stroke-color': INK, 'circle-stroke-width': 2 },
        });

        if (hasGlyphs) {
          const fontOf = (l: LayerSpecification) => (l.type === 'symbol' ? (l.layout as Record<string, unknown> | undefined)?.['text-font'] : undefined);
          const font = styleLayers.map(fontOf).find((f) => Array.isArray(f) && !String(f).includes('Italic'));
          map.addLayer({
            id: 'suburb-labels',
            type: 'symbol',
            source: 'labels',
            minzoom: 11,
            layout: {
              'text-field': ['get', 'name'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 13],
              'text-font': (Array.isArray(font) ? font : ['Noto Sans Regular']) as string[],
              'text-transform': 'uppercase',
              'text-letter-spacing': 0.08,
              'text-padding': 4,
            },
            paint: { 'text-color': '#3f3e3a', 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.6 },
          });
        }

        // Interactions
        let hoverId: string | null = null;
        map.on('mousemove', 'suburbs-fill', (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          const code = f ? String(f.properties?.code ?? f.id) : null;
          if (code !== hoverId) {
            hoverId = code;
            useStore.getState().setHovered(code);
          }
          setHoverPt({ x: e.point.x, y: e.point.y });
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'suburbs-fill', () => {
          hoverId = null;
          useStore.getState().setHovered(null);
          setHoverPt(null);
          map.getCanvas().style.cursor = '';
        });
        map.on('click', (e: MapMouseEvent) => {
          const f = map.queryRenderedFeatures(e.point, { layers: ['suburbs-fill'] })[0];
          useStore.getState().select(f ? String(f.properties?.code ?? f.id) : null);
        });

        setReady(true);
      });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Colour and filter state
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const [code, t] of values.t) {
      map.setFeatureState({ source: 'suburbs', id: code }, { t: t ?? 0, nodata: t == null, dim: !visible.has(code) });
    }
  }, [ready, values, visible]);

  // Selection, pins and hover from outside the map (search, compare list)
  const prev = useRef<{ selected: string | null; pinned: string[]; hovered: string | null }>({ selected: null, pinned: [], hovered: null });
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const p = prev.current;
    const set = (id: string | null, state: Record<string, boolean>) => id && map.setFeatureState({ source: 'suburbs', id }, state);
    set(p.selected, { selected: false });
    set(selected, { selected: true });
    p.pinned.forEach((id) => set(id, { pinned: false }));
    pinned.forEach((id) => set(id, { pinned: true }));
    set(p.hovered, { hover: false });
    set(hovered, { hover: true });
    prev.current = { selected, pinned, hovered };
  }, [ready, selected, pinned, hovered]);

  // Layer toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    vis('tram-lines', layers.tram);
    vis('tram-casing', layers.tram);
    vis('tram-stops', layers.tram);
    vis('tram-catchment-800', layers.tram && layers.tramCatchment);
    vis('tram-catchment-400', layers.tram && layers.tramCatchment);
    vis('train-lines', layers.train);
    vis('train-stations', layers.train);
  }, [ready, layers]);

  // Fly to a suburb picked from search or compare
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !flyTo || !geoRef.current) return;
    const f = geoRef.current.features.find((x) => x.properties.code === flyTo.code);
    if (!f) return;
    const b = bbox(f.geometry);
    const mobile = window.innerWidth < 760;
    map.fitBounds(b, {
      padding: mobile ? { top: 80, bottom: window.innerHeight * 0.55, left: 30, right: 30 } : { top: 80, bottom: 80, left: 420, right: 460 },
      maxZoom: 13,
      duration: 900,
    });
  }, [ready, flyTo]);

  return (
    <div className="map-wrap">
      <div ref={container} className="map" aria-label="Suburb investment heat map" role="region" />
      {hovered && hoverPt && <HoverCard code={hovered} x={hoverPt.x} y={hoverPt.y} scores={scores} />}
    </div>
  );
}

function bbox(g: Polygon | MultiPolygon): [[number, number], [number, number]] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const rings = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
  for (const ring of rings)
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}
