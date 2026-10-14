import type { NextRequest } from "next/server";
import { parseFilters } from "@/lib/filters";
import { TILE_CORS, tileResponse, type TileParams } from "@/lib/tileResponse";
import { parseStyle, renderTile } from "@/lib/tiles";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: TILE_CORS });
}

export async function GET(request: NextRequest, { params }: { params: TileParams }) {
  const search = request.nextUrl.searchParams;
  const filters = parseFilters(search);
  const style = parseStyle(search);
  return tileResponse(
    params,
    (z, x, y) => renderTile(z, x, y, filters, style),
    // Cached in-process and invalidated on sync; let the browser hold it briefly.
    "public, max-age=60"
  );
}
