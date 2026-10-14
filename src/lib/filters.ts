import type { StoredActivity } from "./types";

export type CommuteMode = "include" | "exclude" | "only";

export type Filters = {
  /** YYYY-MM-DD, inclusive. Empty string = unbounded. */
  from: string;
  /** YYYY-MM-DD, inclusive. Empty string = unbounded. */
  to: string;
  /** Strava sport_type values. Empty = all types. */
  types: string[];
  /** kilometres */
  minDistance: number | null;
  maxDistance: number | null;
  /** metres of climbing */
  minElevation: number | null;
  maxElevation: number | null;
  commute: CommuteMode;
};

export const DEFAULT_FILTERS: Filters = {
  from: "",
  to: "",
  types: [],
  minDistance: null,
  maxDistance: null,
  minElevation: null,
  maxElevation: null,
  commute: "include",
};

function num(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseFilters(params: URLSearchParams): Filters {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const commute = params.get("commute");
  const types = (params.get("types") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    from: DATE_RE.test(from) ? from : "",
    to: DATE_RE.test(to) ? to : "",
    types,
    minDistance: num(params.get("minDistance")),
    maxDistance: num(params.get("maxDistance")),
    minElevation: num(params.get("minElevation")),
    maxElevation: num(params.get("maxElevation")),
    commute: commute === "exclude" || commute === "only" ? commute : "include",
  };
}

/** Serialises only non-default values, so URLs stay readable. */
export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.types.length) p.set("types", f.types.join(","));
  if (f.minDistance !== null) p.set("minDistance", String(f.minDistance));
  if (f.maxDistance !== null) p.set("maxDistance", String(f.maxDistance));
  if (f.minElevation !== null) p.set("minElevation", String(f.minElevation));
  if (f.maxElevation !== null) p.set("maxElevation", String(f.maxElevation));
  if (f.commute !== "include") p.set("commute", f.commute);
  return p;
}

/** Stable cache key for a filter set. */
export function filterKey(f: Filters): string {
  const p = filtersToParams(f);
  p.sort();
  return p.toString();
}

/**
 * Date bounds are compared against `startEpoch`, which is the activity's local
 * wall-clock time parsed as UTC — so "2024-05-03" means that calendar day in
 * whatever timezone you were in when you rode.
 */
export function matchesFilters(a: StoredActivity, f: Filters): boolean {
  if (f.from) {
    const fromEpoch = Date.parse(`${f.from}T00:00:00Z`);
    if (a.startEpoch < fromEpoch) return false;
  }
  if (f.to) {
    const toEpoch = Date.parse(`${f.to}T23:59:59.999Z`);
    if (a.startEpoch > toEpoch) return false;
  }
  if (f.types.length && !f.types.includes(a.sportType)) return false;

  const km = a.distance / 1000;
  if (f.minDistance !== null && km < f.minDistance) return false;
  if (f.maxDistance !== null && km > f.maxDistance) return false;

  if (f.minElevation !== null && a.elevation < f.minElevation) return false;
  if (f.maxElevation !== null && a.elevation > f.maxElevation) return false;

  if (f.commute === "exclude" && a.commute) return false;
  if (f.commute === "only" && !a.commute) return false;

  return true;
}

export function applyFilters(activities: StoredActivity[], f: Filters): StoredActivity[] {
  return activities.filter((a) => matchesFilters(a, f));
}
