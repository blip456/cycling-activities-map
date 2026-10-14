"use client";

import { useState } from "react";
import { filtersToParams, type Filters } from "@/lib/filters";
import { Button, Section, Segmented } from "./ui";

type Tolerance = "0" | "10" | "25";

const TOLERANCE_LABELS: Record<Tolerance, string> = {
  "0": "Full",
  "10": "10 m",
  "25": "25 m",
};

/** Very rough: ~46 bytes per <trkpt> line. */
function estimateBytes(points: number, tolerance: Tolerance): number {
  const factor = tolerance === "25" ? 0.35 : tolerance === "10" ? 0.55 : 1;
  return Math.round(points * factor * 46);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ExportPanel({
  filters,
  trackCount,
  pointCount,
}: {
  filters: Filters;
  trackCount: number;
  pointCount: number;
}) {
  const [tolerance, setTolerance] = useState<Tolerance>("0");

  const download = () => {
    const params = filtersToParams(filters);
    if (tolerance !== "0") params.set("simplify", tolerance);
    window.location.href = `/api/export/gpx?${params.toString()}`;
  };

  const bytes = estimateBytes(pointCount, tolerance);
  const heavy = trackCount > 600 || bytes > 12 * 1024 * 1024;

  return (
    <Section
      title="GPX export"
      hint="One multi-track GPX of the filtered activities — import it into your mapping software if you'd rather have the traces as editable tracks than as a tile overlay."
    >
      <div className="mb-3">
        <div className="mb-1 text-xs text-slate-400">Detail</div>
        <Segmented<Tolerance>
          value={tolerance}
          options={[
            { value: "0", label: TOLERANCE_LABELS["0"], title: "Every point Strava returned" },
            { value: "10", label: TOLERANCE_LABELS["10"], title: "Simplify to ~10 m tolerance" },
            { value: "25", label: TOLERANCE_LABELS["25"], title: "Simplify to ~25 m tolerance" },
          ]}
          onChange={setTolerance}
        />
      </div>

      <dl className="mb-3 space-y-1 text-xs text-slate-500">
        <div className="flex justify-between">
          <dt>Tracks</dt>
          <dd className="tabular-nums text-slate-300">{trackCount.toLocaleString()}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Estimated size</dt>
          <dd className="tabular-nums text-slate-300">{formatBytes(bytes)}</dd>
        </div>
      </dl>

      {heavy ? (
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-200/90">
          That&apos;s a lot for mapping software to hold in one file — it will get sluggish. Narrow the
          date range, or use the tile overlay above instead.
        </p>
      ) : null}

      <Button onClick={download} disabled={trackCount === 0} className="w-full">
        Download GPX
      </Button>
    </Section>
  );
}
