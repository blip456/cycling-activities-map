import { NextResponse, type NextRequest } from "next/server";
import { summarizeSquadrats } from "@/lib/squadrats";
import { readSquadrats, readStore, readTokens } from "@/lib/store";
import { appUrl, credentials } from "@/lib/strava";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const store = readStore();
  const tokens = readTokens();
  const { configured } = credentials();

  const counts = new Map<string, number>();
  let maxDistanceKm = 0;
  let maxElevation = 0;
  let commuteCount = 0;
  let oldest: string | null = null;
  let newest: string | null = null;

  for (const a of store.activities) {
    counts.set(a.sportType, (counts.get(a.sportType) ?? 0) + 1);
    maxDistanceKm = Math.max(maxDistanceKm, a.distance / 1000);
    maxElevation = Math.max(maxElevation, a.elevation);
    if (a.commute) commuteCount++;
    const day = a.startDateLocal.slice(0, 10);
    if (!oldest || day < oldest) oldest = day;
    if (!newest || day > newest) newest = day;
  }

  return NextResponse.json({
    credentialsConfigured: configured,
    connected: Boolean(tokens),
    scope: tokens?.scope ?? null,
    athlete: store.athlete,
    appUrl: appUrl(request),
    activityCount: store.activities.length,
    commuteCount,
    lastSyncAt: store.lastSyncAt,
    lastImportAt: store.lastImportAt ?? null,
    dataVersion: store.dataVersion,
    dateRange: { from: oldest, to: newest },
    bounds: {
      maxDistanceKm: Math.ceil(maxDistanceKm),
      maxElevation: Math.ceil(maxElevation),
    },
    sportTypes: [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    squadrats: summarizeSquadrats(readSquadrats()),
  });
}
