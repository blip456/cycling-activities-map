import { createCanvas } from "@napi-rs/canvas";
import { applyFilters, filterKey, type Filters } from "./filters";
import { bboxIntersects, decodePolyline, type BBox } from "./polyline";
import { readStore } from "./store";
import type { StoredActivity } from "./types";

export const TILE_SIZE = 256;
const MAX_LAT = 85.05112878;

// ------------------------------------------------------------- web mercator

export function lngToWorldX(lng: number, worldSize: number): number {
  return ((lng + 180) / 360) * worldSize;
}

export function latToWorldY(lat: number, worldSize: number): number {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const rad = (clamped * Math.PI) / 180;
  const merc = Math.log(Math.tan(Math.PI / 4 + rad / 2));
  return ((1 - merc / Math.PI) / 2) * worldSize;
}

function worldYToLat(y: number, worldSize: number): number {
  const n = Math.PI * (1 - (2 * y) / worldSize);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/** Geographic bounds of a tile, grown by `padPx` screen pixels for line width. */
function tileBounds(z: number, x: number, y: number, padPx: number): BBox {
  const worldSize = TILE_SIZE * 2 ** z;
  const x0 = x * TILE_SIZE - padPx;
  const x1 = (x + 1) * TILE_SIZE + padPx;
  const y0 = y * TILE_SIZE - padPx;
  const y1 = (y + 1) * TILE_SIZE + padPx;
  return [
    (x0 / worldSize) * 360 - 180,
    worldYToLat(y1, worldSize),
    (x1 / worldSize) * 360 - 180,
    worldYToLat(y0, worldSize),
  ];
}

// --------------------------------------------------- decoded-geometry cache

let geometryCache = new Map<number, [number, number][]>();
let geometryCacheVersion = -1;

function coordsFor(activity: StoredActivity, dataVersion: number): [number, number][] {
  if (geometryCacheVersion !== dataVersion) {
    geometryCache = new Map();
    geometryCacheVersion = dataVersion;
  }
  let coords = geometryCache.get(activity.id);
  if (!coords) {
    coords = decodePolyline(activity.polyline);
    geometryCache.set(activity.id, coords);
  }
  return coords;
}

// -------------------------------------------------------------------- style

export type TileStyle = {
  color: string;
  opacity: number;
  /** Multiplier on the zoom-derived line width. */
  weight: number;
  glow: boolean;
};

export const DEFAULT_STYLE: TileStyle = {
  color: "#fc5200",
  opacity: 0.9,
  weight: 1,
  glow: true,
};

export function parseStyle(params: URLSearchParams): TileStyle {
  const rawColor = params.get("color");
  const color = rawColor && /^#?[0-9a-fA-F]{6}$/.test(rawColor)
    ? rawColor.startsWith("#")
      ? rawColor
      : `#${rawColor}`
    : DEFAULT_STYLE.color;

  const opacity = clamp(numOr(params.get("opacity"), DEFAULT_STYLE.opacity), 0.05, 1);
  const weight = clamp(numOr(params.get("weight"), DEFAULT_STYLE.weight), 0.25, 6);
  const glowParam = params.get("glow");
  const glow = glowParam === null ? DEFAULT_STYLE.glow : glowParam !== "0" && glowParam !== "false";

  return { color, opacity, weight, glow };
}

function numOr(raw: string | null, fallback: number): number {
  if (raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function baseWidthForZoom(z: number): number {
  if (z <= 7) return 1.2;
  if (z <= 10) return 1.6;
  if (z <= 12) return 2;
  if (z <= 14) return 2.5;
  if (z <= 16) return 3;
  return 3.5;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ------------------------------------------------------------- tile caching

const MAX_CACHED_TILES = 3000;
const tileCache = new Map<string, Buffer>();

/** Memoises a rendered tile under `key` (Map preserves insertion order → cheap LRU). */
export function cachedTile(key: string, render: () => Buffer): Buffer {
  const hit = tileCache.get(key);
  if (hit) {
    tileCache.delete(key);
    tileCache.set(key, hit);
    return hit;
  }
  const png = render();
  tileCache.set(key, png);
  while (tileCache.size > MAX_CACHED_TILES) {
    const oldest = tileCache.keys().next().value;
    if (oldest === undefined) break;
    tileCache.delete(oldest);
  }
  return png;
}

export function clearTileCache() {
  tileCache.clear();
}

const emptyTiles = new Map<number, Buffer>();
export function transparentTile(size = TILE_SIZE): Buffer {
  let tile = emptyTiles.get(size);
  if (!tile) {
    tile = createCanvas(size, size).encodeSync("png");
    emptyTiles.set(size, tile);
  }
  return tile;
}

// ------------------------------------------------------------------ render

/**
 * Renders one XYZ tile of the filtered activity set as a transparent PNG.
 * Results are memoised per (dataVersion, filters, style, z/x/y).
 */
export function renderTile(
  z: number,
  x: number,
  y: number,
  filters: Filters,
  style: TileStyle
): Buffer {
  const store = readStore();
  const styleKey = `${style.color}|${style.opacity}|${style.weight}|${style.glow ? 1 : 0}`;
  const key = `${store.dataVersion}|${filterKey(filters)}|${styleKey}|${z}/${x}/${y}`;
  return cachedTile(key, () => drawTile(z, x, y, store.activities, store.dataVersion, filters, style));
}

function drawTile(
  z: number,
  x: number,
  y: number,
  activities: StoredActivity[],
  dataVersion: number,
  filters: Filters,
  style: TileStyle
): Buffer {
  const core = baseWidthForZoom(z) * style.weight;
  const glowWidth = core * 3.2;
  const padPx = Math.ceil((style.glow ? glowWidth : core) / 2) + 2;

  const bounds = tileBounds(z, x, y, padPx);
  const visible = applyFilters(activities, filters).filter((a) => bboxIntersects(a.bbox, bounds));
  if (visible.length === 0) return transparentTile();

  const worldSize = TILE_SIZE * 2 ** z;
  const originX = x * TILE_SIZE;
  const originY = y * TILE_SIZE;

  const canvas = createCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = canvas.getContext("2d");
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Build the whole geometry as one path, then stroke once per pass. Stroking a
  // single path means overlapping tracks composite once instead of stacking
  // alpha into a muddy blob.
  ctx.beginPath();
  for (const activity of visible) {
    const coords = coordsFor(activity, dataVersion);
    let lastX = NaN;
    let lastY = NaN;
    let started = false;

    for (let i = 0; i < coords.length; i++) {
      const px = lngToWorldX(coords[i][0], worldSize) - originX;
      const py = latToWorldY(coords[i][1], worldSize) - originY;

      // Decimate: at low zoom consecutive GPS points collapse onto the same
      // pixel, and drawing them all is pure overhead. Always keep the last
      // point so the track doesn't get visibly truncated.
      if (started && i !== coords.length - 1) {
        const dx = px - lastX;
        const dy = py - lastY;
        if (dx * dx + dy * dy < 0.36) continue;
      }

      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
      lastX = px;
      lastY = py;
    }
  }

  if (style.glow) {
    ctx.strokeStyle = rgba(style.color, style.opacity * 0.22);
    ctx.lineWidth = glowWidth;
    ctx.stroke();
  }

  ctx.strokeStyle = rgba(style.color, style.opacity);
  ctx.lineWidth = core;
  ctx.stroke();

  return canvas.encodeSync("png");
}
