import type { NextRequest } from "next/server";
import { applyFilters, parseFilters } from "@/lib/filters";
import { buildGpx } from "@/lib/gpx";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const filters = parseFilters(params);
  const tolerance = Number(params.get("simplify") ?? "0");

  const activities = applyFilters(readStore().activities, filters);

  const describe = [
    `${activities.length} activities`,
    filters.from || filters.to ? `${filters.from || "start"} → ${filters.to || "today"}` : null,
    filters.types.length ? filters.types.join(", ") : "all types",
  ]
    .filter(Boolean)
    .join(" · ");

  const encoder = new TextEncoder();
  const generator = buildGpx(activities, {
    toleranceMeters: Number.isFinite(tolerance) ? tolerance : 0,
    description: describe,
  });

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = generator.next();
      if (next.done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(next.value));
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `cycling-explorer-${stamp}.gpx`;

  return new Response(stream, {
    headers: {
      "Content-Type": "application/gpx+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
