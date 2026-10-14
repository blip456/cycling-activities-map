/**
 * Squadrats (squadrats.com): the Web Mercator grid of tiles you've visited.
 * A squadrat is a zoom-14 slippy tile (~1.5 km), a squadratinho a zoom-17 tile
 * (~200 m). Squadrats also derives a few outline shapes from those — the yard
 * (biggest connected cluster) and the übersquadrat (biggest filled square).
 *
 * Isomorphic: layer definitions and URL building are used by the UI, payload
 * normalisation by the import endpoint.
 */

export type SquadratLayerId =
  | "squadrats"
  | "squadratinhos"
  | "yard"
  | "yardinho"
  | "ubersquadrat"
  | "ubersquadratinho";

export type SquadratLayer = {
  id: SquadratLayerId;
  label: string;
  color: string;
  /** Grid zoom for the tile layers. The outline layers are polygons instead. */
  zoom?: 14 | 17;
  defaultOn: boolean;
};

/** Draw order: filled grids first, outlines on top. */
export const SQUADRAT_LAYERS: SquadratLayer[] = [
  { id: "squadrats", label: "Squadrats", color: "#3b82f6", zoom: 14, defaultOn: true },
  { id: "squadratinhos", label: "Squadratinhos", color: "#a855f7", zoom: 17, defaultOn: true },
  { id: "yard", label: "Yard", color: "#22c55e", defaultOn: false },
  { id: "yardinho", label: "Yardinho", color: "#facc15", defaultOn: false },
  { id: "ubersquadrat", label: "Übersquadrat", color: "#ef4444", defaultOn: false },
  { id: "ubersquadratinho", label: "Übersquadratinho", color: "#f472b6", defaultOn: false },
];

export const DEFAULT_SQUADRAT_LAYERS: SquadratLayerId[] = SQUADRAT_LAYERS.filter(
  (l) => l.defaultOn
).map((l) => l.id);

const OUTLINE_IDS = new Set<string>(SQUADRAT_LAYERS.filter((l) => !l.zoom).map((l) => l.id));

/** [lng, lat] rings of one polygon, outer ring first. */
export type PolygonCoords = [number, number][][];

export type SquadratShape = {
  id: SquadratLayerId;
  /** As Squadrats reports it: tile count for yards, edge length for übersquadrats. */
  size: number | null;
  polygons: PolygonCoords[];
};

export type SquadratsStore = {
  version: 1;
  uid: string | null;
  syncedAt: string | null;
  /** Bumped on every write; keys the tile cache and the tile URL's cache-buster. */
  dataVersion: number;
  /** Visited tiles as "x-y", exactly as the Squadrats API returns them. */
  tiles: { 14: string[]; 17: string[] };
  shapes: SquadratShape[];
};

export const EMPTY_SQUADRATS: SquadratsStore = {
  version: 1,
  uid: null,
  syncedAt: null,
  dataVersion: 0,
  tiles: { 14: [], 17: [] },
  shapes: [],
};

export type SquadratsSummary = {
  uid: string | null;
  syncedAt: string | null;
  dataVersion: number;
  /** Only layers that have data. */
  layers: { id: SquadratLayerId; size: number | null }[];
};

export function summarizeSquadrats(store: SquadratsStore): SquadratsSummary {
  const layers: SquadratsSummary["layers"] = [];
  for (const layer of SQUADRAT_LAYERS) {
    if (layer.zoom) {
      const size = store.tiles[layer.zoom].length;
      if (size > 0) layers.push({ id: layer.id, size });
    } else {
      const shape = store.shapes.find((s) => s.id === layer.id);
      if (shape) layers.push({ id: layer.id, size: shape.size });
    }
  }
  return { uid: store.uid, syncedAt: store.syncedAt, dataVersion: store.dataVersion, layers };
}

// ----------------------------------------------------------------- tile URLs

export function parseSquadratLayers(raw: string | null): SquadratLayerId[] {
  if (raw === null) return DEFAULT_SQUADRAT_LAYERS;
  const wanted = new Set(raw.split(","));
  return SQUADRAT_LAYERS.filter((l) => wanted.has(l.id)).map((l) => l.id);
}

export function squadratsTileUrl(
  appUrl: string,
  layers: SquadratLayerId[],
  dataVersion: number,
  scale: 1 | 2 = 1
): string {
  const params = new URLSearchParams({ layers: layers.join(",") });
  if (scale === 2) params.set("scale", "2");
  // Cache-buster so map clients pick up a fresh sync.
  params.set("v", String(dataVersion));
  return `${appUrl}/api/squadrats/tiles/{z}/{x}/{y}.png?${params.toString()}`;
}

/** Fixed URL whose tiles follow whatever layers the sidebar has ticked. */
export function squadratsLiveTileUrl(appUrl: string): string {
  return `${appUrl}/api/squadrats/tiles/live/{z}/{x}/{y}.png`;
}

// ------------------------------------------------------------------- import

/**
 * What the browser extension posts: the Squadrats API response for one user,
 * plus the "trophies" GeoJSON it links to (null if that download failed).
 */
export type SquadratsImport = {
  uid?: unknown;
  raw?: { 14?: unknown; 17?: unknown } | null;
  trophies?: unknown;
};

const UID_RE = /^[A-Za-z0-9]{8,40}$/;
const TILE_RE = /^\d+-\d+$/;

function tileList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string" && TILE_RE.test(v)))];
}

function isPoint(p: unknown): p is [number, number] {
  return Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

function polygonsOf(geometry: unknown): PolygonCoords[] {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  const raw =
    g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : null;
  if (!Array.isArray(raw)) return [];

  const polygons: PolygonCoords[] = [];
  for (const poly of raw) {
    if (!Array.isArray(poly)) continue;
    const rings = poly
      .filter((ring): ring is unknown[] => Array.isArray(ring))
      .map((ring) => ring.filter(isPoint).map((p) => [p[0], p[1]] as [number, number]))
      .filter((ring) => ring.length >= 3);
    if (rings.length) polygons.push(rings);
  }
  return polygons;
}

/** Picks the outline layers (yard, übersquadrat, …) out of the trophies GeoJSON. */
function shapesOf(trophies: unknown): SquadratShape[] {
  const features = (trophies as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];

  const byId = new Map<SquadratLayerId, SquadratShape>();
  for (const feature of features) {
    const props = (feature?.properties ?? {}) as { name?: unknown; size?: unknown };
    const id = String(props.name ?? "");
    if (!OUTLINE_IDS.has(id)) continue;
    const polygons = polygonsOf(feature.geometry);
    if (!polygons.length) continue;
    const size = Number(props.size);
    const existing = byId.get(id as SquadratLayerId);
    if (existing) existing.polygons.push(...polygons);
    else
      byId.set(id as SquadratLayerId, {
        id: id as SquadratLayerId,
        size: Number.isFinite(size) ? size : null,
        polygons,
      });
  }
  return [...byId.values()];
}

export type NormalizedSquadrats =
  | { ok: true; uid: string; tiles: SquadratsStore["tiles"]; shapes: SquadratShape[] }
  | { ok: false; error: string };

export function normalizeSquadratsImport(body: SquadratsImport): NormalizedSquadrats {
  const uid = typeof body.uid === "string" ? body.uid : "";
  if (!UID_RE.test(uid)) return { ok: false, error: "Missing or invalid Squadrats user id" };

  const tiles = { 14: tileList(body.raw?.[14]), 17: tileList(body.raw?.[17]) };
  if (tiles[14].length === 0 && tiles[17].length === 0) {
    return { ok: false, error: "No visited tiles in the payload" };
  }
  return { ok: true, uid, tiles, shapes: shapesOf(body.trophies) };
}
