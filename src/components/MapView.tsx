"use client";

import maplibregl, { type LngLatBoundsLike, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { CATEGORY_COLORS, CATEGORY_ORDER } from "@/lib/activityTypes";
import type { BBox } from "@/lib/polyline";

export type BasemapId = "dark" | "light" | "osm";

/**
 * Dark/light are OpenFreeMap vector styles: free, no API key. (CARTO's raster
 * basemaps started serving "API KEY REQUIRED" placeholder tiles to keyless
 * requests.) Our activity and preview layers are added on top of whatever the
 * style brings, so swapping a style URL for an inline spec just works.
 */
const BASEMAPS: Record<BasemapId, string | StyleSpecification> = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/positron",
  osm: {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
      },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  },
};

function styleFor(basemap: BasemapId): string | StyleSpecification {
  return BASEMAPS[basemap];
}

/** Colour ramp: ["match", ["get","category"], "cycling", "#fc5200", …, fallback] */
function colorExpression() {
  const expr: unknown[] = ["match", ["get", "category"]];
  for (const category of CATEGORY_ORDER) {
    expr.push(category, CATEGORY_COLORS[category]);
  }
  expr.push(CATEGORY_COLORS.other);
  return expr;
}

/**
 * `zoom` may only feed a *top-level* interpolate/step expression, so the glow
 * needs its own interpolate rather than `["*", width, 3]`.
 */
const WIDTH_STOPS: [number, number][] = [
  [4, 0.7],
  [8, 1.1],
  [11, 1.6],
  [14, 2.4],
  [18, 3.6],
];

function widthExpression(scale = 1) {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    ...WIDTH_STOPS.flatMap(([zoom, width]) => [zoom, width * scale]),
  ];
}

const CAMERA_KEY = "cycling-explorer:camera";

type Camera = { center: [number, number]; zoom: number };

function readCamera(): Camera | null {
  try {
    const raw = localStorage.getItem(CAMERA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Camera;
    if (!Array.isArray(parsed.center) || typeof parsed.zoom !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type MapViewProps = {
  data: GeoJSON.FeatureCollection;
  basemap: BasemapId;
  /** Increment to re-fit the camera to `bounds`. */
  fitToken: number;
  bounds: BBox | null;
  /**
   * When set, renders the /api/tiles overlay *instead of* the vector activity
   * layers — i.e. exactly what your mapping software will show.
   */
  overlayUrl: string | null;
  /** Squadrats raster tiles, drawn underneath the activity lines. Null hides them. */
  squadratsUrl: string | null;
};

export default function MapView({
  data,
  basemap,
  fitToken,
  bounds,
  overlayUrl,
  squadratsUrl,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Latest props, readable from map event handlers without re-binding them.
  const dataRef = useRef(data);
  dataRef.current = data;
  const overlayRef = useRef(overlayUrl);
  overlayRef.current = overlayUrl;
  const squadratsRef = useRef(squadratsUrl);
  squadratsRef.current = squadratsUrl;
  const basemapRef = useRef(basemap);

  // What's currently applied to the map, so reconcile can no-op cheaply.
  const appliedDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const appliedRastersRef = useRef<Record<string, string | null>>({});

  const reconcileRef = useRef<() => void>(() => {});
  // True once the current style's JSON is in. Deliberately not
  // `map.isStyleLoaded()`: that also waits for every tile, which with vector
  // basemaps is false for long stretches and would stall the layer setup.
  const styleReadyRef = useRef(false);

  // ------------------------------------------------------------- init once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const saved = readCamera();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(basemapRef.current),
      center: saved?.center ?? [4.4, 51.05],
      zoom: saved?.zoom ?? 8,
      attributionControl: { compact: true },
      maxZoom: 19,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    /** Adds, swaps or removes raster layer `id` so it shows `url` (nothing when null). */
    const syncRaster = (id: string, url: string | null, beforeId?: string) => {
      const present = Boolean(map.getLayer(id));
      if (present && appliedRastersRef.current[id] === url) return;
      if (present) {
        map.removeLayer(id);
        map.removeSource(id);
      }
      if (url) {
        map.addSource(id, { type: "raster", tiles: [url], tileSize: 256, maxzoom: 19 });
        map.addLayer({ id, type: "raster", source: id }, beforeId);
      }
      appliedRastersRef.current[id] = url;
    };

    /**
     * Idempotent: brings sources, layers, data and overlay in line with the
     * current props. Safe to call repeatedly and after a basemap swap (which
     * throws away every source and layer in the style).
     */
    const reconcile = () => {
      if (!styleReadyRef.current) return;

      // --- activity source + layers
      const existing = map.getSource("activities") as maplibregl.GeoJSONSource | undefined;
      if (!existing) {
        map.addSource("activities", { type: "geojson", data: dataRef.current });
        appliedDataRef.current = dataRef.current;
      } else if (appliedDataRef.current !== dataRef.current) {
        existing.setData(dataRef.current);
        appliedDataRef.current = dataRef.current;
      }

      if (!map.getLayer("activities-glow")) {
        map.addLayer({
          id: "activities-glow",
          type: "line",
          source: "activities",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": colorExpression() as never,
            "line-width": widthExpression(3) as never,
            "line-opacity": 0.18,
            "line-blur": 2,
          },
        });
      }
      if (!map.getLayer("activities-line")) {
        map.addLayer({
          id: "activities-line",
          type: "line",
          source: "activities",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": colorExpression() as never,
            "line-width": widthExpression() as never,
            "line-opacity": 0.85,
          },
        });
      }

      // --- raster overlays: squadrats under the lines, tile preview on top
      syncRaster("squadrats", squadratsRef.current, "activities-glow");
      syncRaster("tile-preview", overlayRef.current);

      // The preview replaces the vector lines so what you see is what
      // the mapping software gets.
      const visibility = overlayRef.current ? "none" : "visible";
      for (const id of ["activities-glow", "activities-line"]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
      }
    };

    reconcileRef.current = reconcile;
    // `style.load` fires once per style (initial and every basemap swap);
    // `styledata`/`idle` are a safety net. reconcile is idempotent, so extra
    // calls are free.
    map.on("style.load", () => {
      styleReadyRef.current = true;
      reconcile();
    });
    map.on("styledata", reconcile);
    map.on("idle", reconcile);

    // `load`/`idle` are driven by requestAnimationFrame, which browsers park in
    // hidden tabs — the style can finish loading with no further event to hang
    // the layer setup off. Poll briefly until the layers exist.
    const settle = setInterval(() => {
      if (map.getLayer("activities-line")) clearInterval(settle);
      else reconcile();
    }, 200);

    map.on("moveend", () => {
      const c = map.getCenter();
      localStorage.setItem(
        CAMERA_KEY,
        JSON.stringify({ center: [c.lng, c.lat], zoom: map.getZoom() })
      );
    });

    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: "280px" });
    map.on("click", "activities-line", (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const p = feature.properties as Record<string, string | number>;
      const km = (Number(p.distance) / 1000).toFixed(1);
      popup
        .setLngLat(event.lngLat)
        .setHTML(
          `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(String(p.name))}</div>` +
            `<div style="color:#9aa4b2">${String(p.date)} · ${escapeHtml(String(p.sportType))}</div>` +
            `<div style="margin-top:4px">${km} km · ${Math.round(Number(p.elevation))} m climbing</div>` +
            `<a href="https://www.strava.com/activities/${String(p.id)}" target="_blank" rel="noreferrer" style="color:#fc5200;display:inline-block;margin-top:6px">Open on Strava →</a>`
        )
        .addTo(map);
    });
    map.on("mouseenter", "activities-line", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "activities-line", () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      clearInterval(settle);
      map.remove();
      mapRef.current = null;
      styleReadyRef.current = false;
      appliedDataRef.current = null;
      appliedRastersRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------- data / overlay changes
  useEffect(() => {
    reconcileRef.current();
  }, [data, overlayUrl, squadratsUrl]);

  // -------------------------------------------------------- basemap switches
  useEffect(() => {
    const map = mapRef.current;
    if (!map || basemapRef.current === basemap) return;
    basemapRef.current = basemap;
    // setStyle drops every source and layer; the style.load handler re-adds
    // ours. diff: false so a fresh style always loads and fires style.load.
    styleReadyRef.current = false;
    appliedDataRef.current = null;
    appliedRastersRef.current = {};
    map.setStyle(styleFor(basemap), { diff: false });
  }, [basemap]);

  // ------------------------------------------------------------ fit request
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bounds || fitToken === 0) return;
    const [minLng, minLat, maxLng, maxLat] = bounds;
    if (!Number.isFinite(minLng)) return;
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ] as LngLatBoundsLike,
      { padding: 64, duration: 700, maxZoom: 14 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken]);

  // Inline positioning on purpose: maplibre-gl.css sets
  // `.maplibregl-map { position: relative }` on this element, which wins over
  // Tailwind's `.absolute` and would otherwise collapse the map to zero height.
  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
