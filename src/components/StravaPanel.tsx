"use client";

import type { StatusResponse } from "@/lib/client-types";
import type { Filters } from "@/lib/filters";
import { liveTileUrl, overlayTileUrl, type OverlayStyle } from "@/lib/overlay";
import ExportPanel from "./ExportPanel";
import FilterPanel from "./FilterPanel";
import LineStylePanel from "./LineStylePanel";
import SyncPanel from "./SyncPanel";
import { Button, Group, SyncHelp, XyzUrls } from "./ui";

/** Whichever route brought data in last: the extension or the official API. */
function lastSynced(status: StatusResponse): string | null {
  const times = [status.lastImportAt, status.lastSyncAt].filter((t): t is string => Boolean(t));
  return times.sort().at(-1) ?? null;
}

export default function StravaPanel({
  status,
  visible,
  onVisibleChange,
  filters,
  onFiltersChange,
  style,
  onStyleChange,
  previewing,
  onPreviewChange,
  trackCount,
  pointCount,
  onSynced,
}: {
  status: StatusResponse;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  style: OverlayStyle;
  onStyleChange: (style: OverlayStyle) => void;
  previewing: boolean;
  onPreviewChange: (previewing: boolean) => void;
  trackCount: number;
  pointCount: number;
  onSynced: () => void;
}) {
  return (
    <Group
      title="Strava"
      color="#fc5200"
      syncedAt={lastSynced(status)}
      visible={visible}
      onVisibleChange={onVisibleChange}
    >
      <FilterPanel
        filters={filters}
        onChange={onFiltersChange}
        sportTypes={status.sportTypes}
        commuteCount={status.commuteCount}
      />

      <LineStylePanel style={style} onStyleChange={onStyleChange} />

      <XyzUrls
        liveUrl={liveTileUrl(status.appUrl)}
        fixedUrl={overlayTileUrl(status.appUrl, filters, style, status.dataVersion)}
      >
        <Button
          onClick={() => onPreviewChange(!previewing)}
          title="Render the tile layer on this map to check it before pasting it into your mapping software"
          className="mt-3 w-full"
        >
          {previewing ? "Hide tile preview" : "Preview tiles on this map"}
        </Button>
      </XyzUrls>

      <ExportPanel filters={filters} trackCount={trackCount} pointCount={pointCount} />

      {status.connected ? <SyncPanel status={status} onFinished={onSynced} /> : null}

      <SyncHelp>
        <li>
          Load the <code className="rounded bg-black/30 px-1">extension/</code> folder once:
          chrome://extensions → Developer mode → <em>Load unpacked</em>.
        </li>
        <li>Open strava.com, logged in, and click the extension&apos;s toolbar button.</li>
        <li>
          A panel bottom-right shows progress. It skips activities already stored, so you can stop
          and resume any time.
        </li>
        <li>Switch back here; new activities show up on their own.</li>
      </SyncHelp>
    </Group>
  );
}
