"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConnectScreen from "@/components/ConnectScreen";
import MappingSoftwareHelp from "@/components/MappingSoftwareHelp";
import SquadratsPanel from "@/components/SquadratsPanel";
import StravaPanel from "@/components/StravaPanel";
import type { BasemapId } from "@/components/MapView";
import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_ORDER, categoryOf } from "@/lib/activityTypes";
import type { ActivitiesResponse, StatusResponse } from "@/lib/client-types";
import { DEFAULT_FILTERS, applyFilters, type Filters } from "@/lib/filters";
import {
  DEFAULT_OVERLAY_STYLE,
  overlayParams,
  overlayTileUrl,
  type OverlayStyle,
} from "@/lib/overlay";
import { bboxUnion, decodePolyline, estimatePoints, type BBox } from "@/lib/polyline";
import {
  DEFAULT_SQUADRAT_LAYERS,
  SQUADRAT_LAYERS,
  squadratsTileUrl,
  type SquadratLayerId,
} from "@/lib/squadrats";
import type { StoredActivity } from "@/lib/types";
import { Segmented } from "@/components/ui";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">
      Loading map…
    </div>
  ),
});

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export default function Page() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [activities, setActivities] = useState<StoredActivity[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [basemap, setBasemap] = useState<BasemapId>("dark");
  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>(DEFAULT_OVERLAY_STYLE);
  const [previewing, setPreviewing] = useState(false);
  const [fitToken, setFitToken] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [showActivities, setShowActivities] = useState(true);
  const [showSquadrats, setShowSquadrats] = useState(true);
  const [squadratLayers, setSquadratLayers] = useState<SquadratLayerId[]>(DEFAULT_SQUADRAT_LAYERS);

  const statusRef = useRef<StatusResponse | null>(null);
  const coordCache = useRef(new Map<number, [number, number][]>());

  // --------------------------------------------------------------- bootstrap
  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/status", { cache: "no-store" });
    const data = (await res.json()) as StatusResponse;
    statusRef.current = data;
    setStatus(data);
    return data;
  }, []);

  const loadActivities = useCallback(async () => {
    setLoadingActivities(true);
    try {
      const res = await fetch("/api/activities", { cache: "no-store" });
      const data = (await res.json()) as ActivitiesResponse;
      coordCache.current = new Map();
      setActivities(data.activities);
    } finally {
      setLoadingActivities(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error) setAuthError(error);
    if (error || params.get("connected")) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    void (async () => {
      const data = await loadStatus();
      // Not gated on `connected`: the extension path stores activities without
      // ever completing OAuth.
      if (data.activityCount > 0) await loadActivities();
    })();
  }, [loadStatus, loadActivities]);

  /** Reloads status, and activities too unless `onlyIfChanged` and nothing new was imported. */
  const refresh = useCallback(
    async ({ onlyIfChanged = false } = {}) => {
      const previous = statusRef.current?.dataVersion;
      const data = await loadStatus();
      if (onlyIfChanged && data.dataVersion === previous) return;
      if (data.activityCount > 0) await loadActivities();
      else setActivities([]);
    },
    [loadStatus, loadActivities]
  );

  // Pick up whatever the extension imported while you were on strava.com or
  // squadrats.com. Squadrats need no extra work: their tile URL carries the
  // data version from the status response.
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === "visible") void refresh({ onlyIfChanged: true });
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [refresh]);

  // ------------------------------------------------------------- derived data
  const filtered = useMemo(() => applyFilters(activities, filters), [activities, filters]);

  const coordsFor = useCallback((activity: StoredActivity) => {
    let coords = coordCache.current.get(activity.id);
    if (!coords) {
      coords = decodePolyline(activity.polyline);
      coordCache.current.set(activity.id, coords);
    }
    return coords;
  }, []);

  const geojson = useMemo<GeoJSON.FeatureCollection>(() => {
    if (filtered.length === 0) return EMPTY_COLLECTION;
    return {
      type: "FeatureCollection",
      features: filtered.map((activity) => ({
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: coordsFor(activity) },
        properties: {
          id: activity.id,
          name: activity.name,
          sportType: activity.sportType,
          category: categoryOf(activity.sportType),
          date: activity.startDateLocal.slice(0, 10),
          distance: activity.distance,
          elevation: activity.elevation,
        },
      })),
    };
  }, [filtered, coordsFor]);

  const bounds = useMemo<BBox | null>(
    () => bboxUnion(filtered.map((a) => a.bbox)),
    [filtered]
  );

  const totals = useMemo(() => {
    let distance = 0;
    let elevation = 0;
    let points = 0;
    for (const a of filtered) {
      distance += a.distance;
      elevation += a.elevation;
      points += estimatePoints(a.polyline);
    }
    return { km: distance / 1000, elevation, points };
  }, [filtered]);

  const activeCategories = useMemo(() => {
    const set = new Set(filtered.map((a) => categoryOf(a.sportType)));
    return CATEGORY_ORDER.filter((c) => set.has(c));
  }, [filtered]);

  const overlayUrl = useMemo(
    () =>
      status
        ? overlayTileUrl(status.appUrl, filters, overlayStyle, status.dataVersion)
        : null,
    [status, filters, overlayStyle]
  );

  const hasSquadrats = (status?.squadrats.layers.length ?? 0) > 0;
  const visibleSquadratLayers = useMemo(
    () =>
      hasSquadrats && showSquadrats
        ? SQUADRAT_LAYERS.filter(
            (l) => squadratLayers.includes(l.id) && status?.squadrats.layers.some((s) => s.id === l.id)
          )
        : [],
    [hasSquadrats, showSquadrats, squadratLayers, status]
  );

  const squadratsUrl = useMemo(
    () =>
      status && visibleSquadratLayers.length > 0
        ? squadratsTileUrl(
            status.appUrl,
            visibleSquadratLayers.map((l) => l.id),
            status.squadrats.dataVersion,
            2
          )
        : null,
    [status, visibleSquadratLayers]
  );

  // Keep /api/tiles/live in step with the sidebar. Debounced so dragging a
  // slider doesn't fire a request per step.
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch("/api/tiles/live", {
        method: "PUT",
        body: overlayParams(filters, overlayStyle).toString(),
      }).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [filters, overlayStyle]);

  // Same for /api/squadrats/tiles/live: it follows the ticked layers.
  useEffect(() => {
    void fetch("/api/squadrats/tiles/live", {
      method: "PUT",
      body: new URLSearchParams({ layers: squadratLayers.join(",") }).toString(),
    }).catch(() => {});
  }, [squadratLayers]);

  // ------------------------------------------------------------------ render
  if (!status) {
    return (
      <div className="grid h-full place-items-center text-sm text-slate-500">Loading…</div>
    );
  }

  // The extension path never sets OAuth tokens, so having data is enough to
  // show the map — `connected` only gates the API sync controls.
  if (!status.connected && status.activityCount === 0 && !hasSquadrats) {
    return <ConnectScreen status={status} error={authError} />;
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-[368px] shrink-0 flex-col border-r border-ink-600 bg-ink-800">
        <header className="flex items-center gap-2 border-b border-ink-600 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-strava" />
          <h1 className="text-sm font-semibold tracking-tight text-slate-100">
            Cycling Explorer
          </h1>
          <span className="ml-auto text-[11px] tabular-nums text-slate-500">
            {filtered.length.toLocaleString()} / {activities.length.toLocaleString()}
          </span>
        </header>

        <div className="rail min-h-0 flex-1 overflow-y-auto">
          <SquadratsPanel
            appUrl={status.appUrl}
            summary={status.squadrats}
            visible={showSquadrats}
            onVisibleChange={setShowSquadrats}
            layers={squadratLayers}
            onLayersChange={setSquadratLayers}
          />

          <StravaPanel
            status={status}
            visible={showActivities}
            onVisibleChange={setShowActivities}
            filters={filters}
            onFiltersChange={setFilters}
            style={overlayStyle}
            onStyleChange={setOverlayStyle}
            previewing={previewing}
            onPreviewChange={setPreviewing}
            trackCount={filtered.length}
            pointCount={totals.points}
            onSynced={refresh}
          />

          <MappingSoftwareHelp />
        </div>
      </aside>

      <main className="relative min-w-0 flex-1">
        <MapView
          data={showActivities ? geojson : EMPTY_COLLECTION}
          basemap={basemap}
          fitToken={fitToken}
          bounds={bounds}
          overlayUrl={showActivities && previewing ? overlayUrl : null}
          squadratsUrl={squadratsUrl}
        />

        {/* stats + actions */}
        <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
          <div className="pointer-events-auto flex items-stretch gap-0 overflow-hidden rounded-xl border border-ink-500/80 bg-ink-800/90 backdrop-blur">
            <Stat label="Activities" value={filtered.length.toLocaleString()} />
            <Stat label="Distance" value={`${Math.round(totals.km).toLocaleString()} km`} />
            <Stat
              label="Climbing"
              value={`${Math.round(totals.elevation / 1000).toLocaleString()} km`}
            />
          </div>

          <div className="pointer-events-auto flex gap-2">
            <button
              type="button"
              onClick={() => setFitToken((n) => n + 1)}
              disabled={!bounds}
              className="rounded-lg border border-ink-500/80 bg-ink-800/90 px-3 py-1.5 text-xs text-slate-300 backdrop-blur transition-colors hover:bg-ink-700 disabled:opacity-40"
            >
              Zoom to selection
            </button>
            <button
              type="button"
              onClick={() => setShowActivities((v) => !v)}
              className={
                "rounded-lg border bg-ink-800/90 px-3 py-1.5 text-xs backdrop-blur transition-colors hover:bg-ink-700 " +
                (showActivities ? "border-strava/60 text-orange-200" : "border-ink-500/80 text-slate-300")
              }
            >
              Strava {showActivities ? "on" : "off"}
            </button>
            {hasSquadrats ? (
              <button
                type="button"
                onClick={() => setShowSquadrats((v) => !v)}
                className={
                  "rounded-lg border bg-ink-800/90 px-3 py-1.5 text-xs backdrop-blur transition-colors hover:bg-ink-700 " +
                  (showSquadrats
                    ? "border-blue-400/60 text-blue-200"
                    : "border-ink-500/80 text-slate-300")
                }
              >
                Squadrats {showSquadrats ? "on" : "off"}
              </button>
            ) : null}
            {showActivities && previewing ? (
              <span className="rounded-lg border border-strava/40 bg-strava/15 px-3 py-1.5 text-xs text-orange-200 backdrop-blur">
                Showing tile overlay
              </span>
            ) : null}
            {loadingActivities ? (
              <span className="rounded-lg border border-ink-500/80 bg-ink-800/90 px-3 py-1.5 text-xs text-slate-400 backdrop-blur">
                Loading activities…
              </span>
            ) : null}
          </div>
        </div>

        <div className="absolute bottom-8 right-4 flex flex-col items-end gap-2">
          {(showActivities && activeCategories.length > 1 && !previewing) ||
          visibleSquadratLayers.length > 0 ? (
            <div className="rounded-xl border border-ink-500/80 bg-ink-800/90 px-3 py-2 backdrop-blur">
              {showActivities && !previewing && activeCategories.length > 1
                ? activeCategories.map((category) => (
                    <div key={category} className="flex items-center gap-2 py-0.5 text-[11px]">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: CATEGORY_COLORS[category] }}
                      />
                      <span className="text-slate-300">{CATEGORY_LABELS[category]}</span>
                    </div>
                  ))
                : null}
              {visibleSquadratLayers.map((layer) => (
                <div key={layer.id} className="flex items-center gap-2 py-0.5 text-[11px]">
                  <span
                    className="h-2 w-2 rounded-[2px] border"
                    style={{
                      borderColor: layer.color,
                      background: layer.zoom ? `${layer.color}55` : "transparent",
                    }}
                  />
                  <span className="text-slate-300">{layer.label}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="w-40">
            <Segmented<BasemapId>
              value={basemap}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
                { value: "osm", label: "OSM" },
              ]}
              onChange={setBasemap}
            />
          </div>
        </div>

        {activities.length === 0 && !loadingActivities ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="pointer-events-auto max-w-sm rounded-xl border border-ink-500 bg-ink-800/95 px-5 py-4 text-sm text-slate-300 backdrop-blur">
              <p className="font-medium text-slate-100">No activities cached yet</p>
              {status.connected ? (
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Hit <strong>Import activities</strong> in the sidebar. Strava allows 100 reads per
                  15 minutes; 200 activities come back per request, so even a decade of riding is a
                  few seconds of work.
                </p>
              ) : (
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Run the browser extension on strava.com, then switch back to this tab.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-ink-600 px-3 py-2 last:border-r-0">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-slate-100">{value}</div>
    </div>
  );
}
