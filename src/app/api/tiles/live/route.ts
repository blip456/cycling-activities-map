import { NextResponse, type NextRequest } from "next/server";
import { readLiveOverlay, writeLiveOverlay } from "@/lib/liveOverlay";

export const dynamic = "force-dynamic";

/** Current config behind /api/tiles/live/{z}/{x}/{y}.png. */
export async function GET() {
  return NextResponse.json(readLiveOverlay("activities"));
}

/** Body: the overlay query string, e.g. "types=Ride&color=fc5200&weight=1". */
export async function PUT(request: NextRequest) {
  const params = new URLSearchParams(await request.text());
  // Drop the cache-buster: the live route reads dataVersion itself.
  params.delete("v");
  return NextResponse.json(writeLiveOverlay("activities", params.toString()));
}
