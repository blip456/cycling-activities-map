import { readLiveOverlay } from "@/lib/liveOverlay";
import { renderSquadratsTile } from "@/lib/squadratTiles";
import { parseSquadratLayers } from "@/lib/squadrats";
import { TILE_CORS, tileResponse, type TileParams } from "@/lib/tileResponse";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: TILE_CORS });
}

/** Same tiles as /api/squadrats/tiles, with the layers the UI last pushed. */
export async function GET(_request: Request, { params }: { params: TileParams }) {
  const layers = parseSquadratLayers(
    new URLSearchParams(readLiveOverlay("squadrats").query).get("layers")
  );
  // The config can change at any moment, so never let the browser reuse a tile.
  return tileResponse(params, (z, x, y) => renderSquadratsTile(z, x, y, layers, 1), "no-store");
}
