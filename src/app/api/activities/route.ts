import { NextResponse } from "next/server";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Returns the whole cached activity set with polylines still encoded — the
 * client decodes them once and does all filtering locally, so moving a slider
 * doesn't cost a round trip.
 */
export async function GET() {
  const store = readStore();
  return NextResponse.json(
    {
      dataVersion: store.dataVersion,
      activities: store.activities.map((a) => ({
        id: a.id,
        name: a.name,
        sportType: a.sportType,
        startDateLocal: a.startDateLocal,
        startEpoch: a.startEpoch,
        distance: a.distance,
        elevation: a.elevation,
        movingTime: a.movingTime,
        commute: a.commute,
        trainer: a.trainer,
        polyline: a.polyline,
        bbox: a.bbox,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
