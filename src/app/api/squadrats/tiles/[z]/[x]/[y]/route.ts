import type { NextRequest } from "next/server";
import { renderSquadratsTile } from "@/lib/squadratTiles";
import { parseSquadratLayers } from "@/lib/squadrats";
import { TILE_CORS, tileResponse, type TileParams } from "@/lib/tileResponse";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: TILE_CORS });
}

/** `?layers=squadrats,yard` picks layers (default: squadrats + squadratinhos); `?scale=2` for 512 px. */
export async function GET(request: NextRequest, { params }: { params: TileParams }) {
  const search = request.nextUrl.searchParams;
  const layers = parseSquadratLayers(search.get("layers"));
  const scale = search.get("scale") === "2" ? 2 : 1;
  return tileResponse(
    params,
    (z, x, y) => renderSquadratsTile(z, x, y, layers, scale),
    // Cached in-process and invalidated on sync; let the browser hold it briefly.
    "public, max-age=60"
  );
}
