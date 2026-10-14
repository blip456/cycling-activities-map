import { parseFilters } from "@/lib/filters";
import { readLiveOverlay } from "@/lib/liveOverlay";
import { TILE_CORS, tileResponse, type TileParams } from "@/lib/tileResponse";
import { parseStyle, renderTile } from "@/lib/tiles";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: TILE_CORS });
}

/** Same tiles as /api/tiles, but styled and filtered by whatever the UI last pushed. */
export async function GET(_request: Request, { params }: { params: TileParams }) {
  const live = new URLSearchParams(readLiveOverlay("activities").query);
  const filters = parseFilters(live);
  const style = parseStyle(live);
  // The config can change at any moment, so never let the browser reuse a tile.
  return tileResponse(params, (z, x, y) => renderTile(z, x, y, filters, style), "no-store");
}
