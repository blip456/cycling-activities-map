import { NextResponse, type NextRequest } from "next/server";
import { clearActivities, readStore, setLastImportAt, upsertActivities } from "@/lib/store";
import { clearTileCache } from "@/lib/tiles";
import type { StoredActivity } from "@/lib/types";
import {
  DEFAULT_TOLERANCE_METERS,
  normalizeWebActivity,
  type WebActivityInput,
} from "@/lib/webImport";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * The browser extension posts here from a strava.com page, so this endpoint is
 * cross-origin by design. It only ever writes to the local store.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * Lets the extension skip work it's already done: it asks which activity ids
 * are stored, then only fetches streams for the ones missing. That's what makes
 * a 2 000-activity backfill resumable across sessions.
 */
export async function GET() {
  const store = readStore();
  return NextResponse.json(
    {
      activityCount: store.activities.length,
      knownIds: store.activities.map((a) => a.id),
      lastImportAt: store.lastImportAt ?? null,
      defaultToleranceMeters: DEFAULT_TOLERANCE_METERS,
    },
    { headers: CORS }
  );
}

type ImportBody = {
  activities?: WebActivityInput[];
  toleranceMeters?: number;
  /** Wipe the store before inserting — used by "start over" in the extension. */
  reset?: boolean;
};

export async function POST(request: NextRequest) {
  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400, headers: CORS });
  }

  const incoming = body.activities;
  if (!Array.isArray(incoming)) {
    return NextResponse.json(
      { error: "Expected { activities: [...] }" },
      { status: 400, headers: CORS }
    );
  }

  const tolerance =
    typeof body.toleranceMeters === "number" && body.toleranceMeters >= 0
      ? body.toleranceMeters
      : DEFAULT_TOLERANCE_METERS;

  if (body.reset) clearActivities();

  const accepted: StoredActivity[] = [];
  const skipped: { id: number; reason: string }[] = [];

  for (const raw of incoming) {
    const result = normalizeWebActivity(raw, tolerance);
    if (result.ok) accepted.push(result.activity);
    else skipped.push({ id: result.id, reason: result.reason });
  }

  if (accepted.length > 0) {
    upsertActivities(accepted);
    setLastImportAt(new Date().toISOString());
    clearTileCache();
  }

  return NextResponse.json(
    {
      imported: accepted.length,
      skipped,
      total: readStore().activities.length,
    },
    { headers: CORS }
  );
}
