import { NextResponse, type NextRequest } from "next/server";
import { normalizeSquadratsImport, summarizeSquadrats, type SquadratsImport } from "@/lib/squadrats";
import { readSquadrats, writeSquadrats } from "@/lib/store";
import { clearTileCache } from "@/lib/tiles";

export const dynamic = "force-dynamic";

/**
 * The browser extension posts here from a squadrats.com page, so this endpoint
 * is cross-origin by design. It only ever writes to the local store.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** What's stored — the extension reads `uid` from here to sync from any squadrats.com page. */
export async function GET() {
  return NextResponse.json(summarizeSquadrats(readSquadrats()), { headers: CORS });
}

/** Body: `{ uid, raw: { 14: ["x-y", …], 17: [...] }, trophies: GeoJSON | null }`. */
export async function POST(request: NextRequest) {
  let body: SquadratsImport;
  try {
    body = (await request.json()) as SquadratsImport;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400, headers: CORS });
  }

  const result = normalizeSquadratsImport(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400, headers: CORS });
  }

  writeSquadrats({ uid: result.uid, tiles: result.tiles, shapes: result.shapes });
  clearTileCache();
  return NextResponse.json(summarizeSquadrats(readSquadrats()), { headers: CORS });
}
