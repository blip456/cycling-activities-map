import { NextResponse, type NextRequest } from "next/server";
import { readLiveOverlay, writeLiveOverlay } from "@/lib/liveOverlay";
import { parseSquadratLayers } from "@/lib/squadrats";

export const dynamic = "force-dynamic";

/** Current config behind /api/squadrats/tiles/live/{z}/{x}/{y}.png. */
export async function GET() {
  return NextResponse.json(readLiveOverlay("squadrats"));
}

/** Body: "layers=squadrats,yard". Only the layer list is kept. */
export async function PUT(request: NextRequest) {
  const layers = parseSquadratLayers(new URLSearchParams(await request.text()).get("layers"));
  const query = new URLSearchParams({ layers: layers.join(",") }).toString();
  return NextResponse.json(writeLiveOverlay("squadrats", query));
}
