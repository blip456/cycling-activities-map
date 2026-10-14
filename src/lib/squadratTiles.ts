import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { SQUADRAT_LAYERS, type PolygonCoords, type SquadratLayerId } from "./squadrats";
import { readSquadrats } from "./store";
import { TILE_SIZE, cachedTile, latToWorldY, lngToWorldX, rgba, transparentTile } from "./tiles";

const FILL_OPACITY = 0.22;
const CELL_LINE_WIDTH = 1.25;
const SHAPE_LINE_WIDTH = 2.5;
/** Below this many pixels per cell, outlines would just smear into the fill. */
const MIN_OUTLINED_CELL_PX = 2;

// ------------------------------------------------------------ parsed grids

/** Visited cells of one zoom level, parsed once per data version. */
type Grid = { xs: Int32Array; ys: Int32Array; visited: Set<number> };

/** Wider than the zoom-17 grid (2^17 cells), so x * stride + y is unique. */
const KEY_STRIDE = 2 ** 18;

function buildGrid(tiles: string[]): Grid {
  const xs = new Int32Array(tiles.length);
  const ys = new Int32Array(tiles.length);
  const visited = new Set<number>();
  tiles.forEach((tile, i) => {
    const [x, y] = tile.split("-").map(Number);
    xs[i] = x;
    ys[i] = y;
    visited.add(x * KEY_STRIDE + y);
  });
  return { xs, ys, visited };
}

let grids: { dataVersion: number; 14: Grid; 17: Grid } | null = null;

function gridsFor(dataVersion: number, tiles: { 14: string[]; 17: string[] }) {
  if (grids?.dataVersion !== dataVersion) {
    grids = { dataVersion, 14: buildGrid(tiles[14]), 17: buildGrid(tiles[17]) };
  }
  return grids;
}

// ------------------------------------------------------------------ drawing

/**
 * Fills every visited cell and strokes only the sides that border an unvisited
 * one — i.e. the outline of the whole visited area, holes included.
 */
function drawCells(
  ctx: SKRSContext2D,
  grid: Grid,
  cellZoom: number,
  tile: { z: number; x: number; y: number; size: number },
  color: string,
  scale: number
): boolean {
  const cell = tile.size * 2 ** (tile.z - cellZoom);
  const originX = tile.x * tile.size;
  const originY = tile.y * tile.size;

  const visible: number[] = [];
  ctx.beginPath();
  for (let i = 0; i < grid.xs.length; i++) {
    const left = grid.xs[i] * cell - originX;
    const top = grid.ys[i] * cell - originY;
    if (left >= tile.size || top >= tile.size || left + cell <= 0 || top + cell <= 0) continue;
    ctx.rect(left, top, cell, cell);
    visible.push(i);
  }
  if (visible.length === 0) return false;

  ctx.fillStyle = rgba(color, FILL_OPACITY);
  ctx.fill();

  if (cell < MIN_OUTLINED_CELL_PX) return true;

  const has = (x: number, y: number) => grid.visited.has(x * KEY_STRIDE + y);
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  };

  ctx.beginPath();
  for (const i of visible) {
    const cx = grid.xs[i];
    const cy = grid.ys[i];
    const left = cx * cell - originX;
    const top = cy * cell - originY;
    const right = left + cell;
    const bottom = top + cell;
    if (!has(cx, cy - 1)) edge(left, top, right, top);
    if (!has(cx, cy + 1)) edge(left, bottom, right, bottom);
    if (!has(cx - 1, cy)) edge(left, top, left, bottom);
    if (!has(cx + 1, cy)) edge(right, top, right, bottom);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = CELL_LINE_WIDTH * scale;
  ctx.stroke();
  return true;
}

/** Outline-only polygons. The canvas clips to the tile, so no clipping maths needed. */
function drawShapes(
  ctx: SKRSContext2D,
  polygons: PolygonCoords[],
  tile: { z: number; x: number; y: number; size: number },
  color: string,
  scale: number
) {
  const worldSize = tile.size * 2 ** tile.z;
  const originX = tile.x * tile.size;
  const originY = tile.y * tile.size;

  ctx.beginPath();
  for (const rings of polygons) {
    for (const ring of rings) {
      ring.forEach(([lng, lat], i) => {
        const px = lngToWorldX(lng, worldSize) - originX;
        const py = latToWorldY(lat, worldSize) - originY;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    }
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = SHAPE_LINE_WIDTH * scale;
  ctx.stroke();
}

// ------------------------------------------------------------------- render

/**
 * One XYZ tile of the chosen Squadrats layers as a transparent PNG.
 * `scale` 2 renders 512 px tiles for crisp edges on high-DPI screens.
 */
export function renderSquadratsTile(
  z: number,
  x: number,
  y: number,
  layers: SquadratLayerId[],
  scale: 1 | 2
): Buffer {
  const store = readSquadrats();
  const key = `squadrats|${store.dataVersion}|${layers.join(",")}|${scale}|${z}/${x}/${y}`;

  return cachedTile(key, () => {
    const size = TILE_SIZE * scale;
    const tile = { z, x, y, size };
    const grid = gridsFor(store.dataVersion, store.tiles);
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.lineJoin = "round";
    let drew = false;

    for (const layer of SQUADRAT_LAYERS) {
      if (!layers.includes(layer.id)) continue;
      if (layer.zoom) {
        drew = drawCells(ctx, grid[layer.zoom], layer.zoom, tile, layer.color, scale) || drew;
      } else {
        const shape = store.shapes.find((s) => s.id === layer.id);
        if (!shape) continue;
        drawShapes(ctx, shape.polygons, tile, layer.color, scale);
        drew = true;
      }
    }

    return drew ? canvas.encodeSync("png") : transparentTile(size);
  });
}
