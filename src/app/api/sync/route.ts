import type { NextRequest } from "next/server";
import {
  clearActivities,
  newestActivityEpochSeconds,
  readStore,
  readTokens,
  setAthlete,
  setLastSyncAt,
  upsertActivities,
} from "@/lib/store";
import {
  RateLimitError,
  accessToken,
  fetchActivityPage,
  fetchAthlete,
  normalizeActivity,
  type RateLimit,
} from "@/lib/strava";
import { clearTileCache } from "@/lib/tiles";
import type { StoredActivity } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 3600;

const PER_PAGE = 200;
/**
 * On an incremental sync, rewind the watermark a week: Strava lets you upload
 * backdated activities and edit old ones, and a week of overlap is cheap.
 */
const OVERLAP_SECONDS = 7 * 24 * 60 * 60;
/** Flush to disk every N pages so a crash mid-sync doesn't throw away the work. */
const FLUSH_EVERY_PAGES = 5;

type SyncEvent =
  | { type: "start"; mode: "full" | "incremental"; since: string | null }
  | {
      type: "progress";
      page: number;
      fetched: number;
      withGps: number;
      rateLimit: RateLimit | null;
    }
  | { type: "done"; fetched: number; withGps: number; total: number; lastSyncAt: string }
  | { type: "error"; message: string; code?: "rate_limit" | "not_connected"; fetched: number };

export async function GET(request: NextRequest) {
  const full = request.nextUrl.searchParams.get("full") === "1";
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SyncEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      let fetched = 0;
      const pending: StoredActivity[] = [];
      let keptTotal = 0;

      const flush = () => {
        if (pending.length === 0) return;
        upsertActivities(pending);
        pending.length = 0;
      };

      try {
        if (!readTokens()) {
          send({ type: "error", message: "Not connected to Strava", code: "not_connected", fetched: 0 });
          controller.close();
          return;
        }

        const token = await accessToken();

        if (!readStore().athlete) {
          setAthlete(await fetchAthlete(token));
        }

        if (full) clearActivities();

        const watermark = full ? null : newestActivityEpochSeconds();
        const after = watermark ? Math.floor(watermark / 1000) - OVERLAP_SECONDS : null;

        send({
          type: "start",
          mode: full ? "full" : "incremental",
          since: after ? new Date(after * 1000).toISOString() : null,
        });

        for (let page = 1; ; page++) {
          const { activities, rateLimit } = await fetchActivityPage({
            token,
            page,
            perPage: PER_PAGE,
            after,
          });

          if (activities.length === 0) break;
          fetched += activities.length;

          for (const raw of activities) {
            const normalized = normalizeActivity(raw);
            if (normalized) {
              pending.push(normalized);
              keptTotal++;
            }
          }

          if (page % FLUSH_EVERY_PAGES === 0) flush();

          send({ type: "progress", page, fetched, withGps: keptTotal, rateLimit });

          if (activities.length < PER_PAGE) break;
        }

        flush();
        const lastSyncAt = new Date().toISOString();
        setLastSyncAt(lastSyncAt);
        clearTileCache();

        send({
          type: "done",
          fetched,
          withGps: keptTotal,
          total: readStore().activities.length,
          lastSyncAt,
        });
      } catch (e) {
        flush();
        clearTileCache();
        if (e instanceof RateLimitError) {
          send({
            type: "error",
            code: "rate_limit",
            message:
              "Strava rate limit hit. Everything fetched so far is saved — wait 15 minutes and sync again to continue.",
            fetched,
          });
        } else {
          send({
            type: "error",
            message: e instanceof Error ? e.message : "Sync failed",
            fetched,
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
