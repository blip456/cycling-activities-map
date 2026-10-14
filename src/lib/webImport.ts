import { bboxOf, encodePolyline, simplify } from "./polyline";
import type { StoredActivity } from "./types";

/**
 * One activity as scraped from Strava's own web endpoints by the browser
 * extension. Everything except `id` and `latlng` is best-effort — field names
 * on those endpoints are undocumented and drift, so the importer derives what
 * it can from the streams instead of trusting the list JSON.
 */
export type WebActivityInput = {
  id: number | string;
  name?: string | null;
  /** Either a Strava sport_type key ("GravelRide") or a display name ("Gravel Ride"). */
  type?: string | null;
  /** ISO 8601 string of the local start time. */
  startDateLocal?: string | null;
  /** Epoch *seconds* of the local start time, as `start_date_local_raw` gives it. */
  startDateLocalRaw?: number | null;
  /** [lat, lng] pairs, in Strava's stream order. */
  latlng?: [number, number][] | null;
  /** Cumulative metres along the track. */
  distanceStream?: number[] | null;
  /** Metres above sea level, one per point. */
  altitudeStream?: number[] | null;
  movingTime?: number | null;
  commute?: boolean | null;
  trainer?: boolean | null;
};

/**
 * Storage resolution for imported tracks. Streams arrive at ~1 point/second,
 * which is far more than "have I ridden this road" needs and would balloon the
 * store. 15 m keeps roads distinguishable (they're ~10 m wide) while cutting
 * a 5 000-point ride to a few hundred.
 */
export const DEFAULT_TOLERANCE_METERS = 15;

/** "Gravel Ride" / "E-Bike Ride" → "GravelRide" / "EBikeRide" */
export function normalizeSportType(raw: string | null | undefined): string {
  if (!raw) return "Workout";
  const trimmed = raw.trim();
  if (!trimmed) return "Workout";
  // Already a sport_type key.
  if (!/[\s-]/.test(trimmed)) return trimmed;
  return trimmed
    .split(/[\s-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** Moving average over `window` samples, centred. */
function smoothSeries(values: number[], window: number): number[] {
  const half = window >> 1;
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    const from = Math.max(0, i - half);
    const to = Math.min(values.length - 1, i + half);
    let sum = 0;
    for (let j = from; j <= to; j++) sum += values[j];
    out[i] = sum / (to - from + 1);
  }
  return out;
}

/**
 * Total climbing, via smoothing plus hysteresis.
 *
 * Naively summing positive deltas of a GPS altitude stream massively
 * overcounts: metre-scale noise at 1 Hz accumulates into hundreds of phantom
 * metres over a long ride. So this smooths first, then only commits a climb
 * once the trace has turned back down by more than THRESHOLD — the standard
 * approach, and the reason small rolling bumps under ~3 m go uncounted.
 *
 * Approximate by design: Strava's own figure uses barometric data we don't get.
 */
export function elevationGain(altitude: number[] | null | undefined): number {
  if (!altitude || altitude.length < 3) return 0;

  const THRESHOLD = 3; // metres of reversal needed to confirm a turning point
  const series = smoothSeries(altitude, 15);

  let gain = 0;
  let lastConfirmed = series[0];
  let extreme = series[0];
  let rising = true;

  for (let i = 1; i < series.length; i++) {
    const v = series[i];
    if (rising) {
      if (v > extreme) {
        extreme = v;
      } else if (v < extreme - THRESHOLD) {
        gain += extreme - lastConfirmed;
        lastConfirmed = extreme;
        extreme = v;
        rising = false;
      }
    } else {
      if (v < extreme) {
        extreme = v;
      } else if (v > extreme + THRESHOLD) {
        lastConfirmed = extreme;
        extreme = v;
        rising = true;
      }
    }
  }

  if (rising && extreme > lastConfirmed) gain += extreme - lastConfirmed;
  return Math.round(gain);
}

function haversineLength(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const meanLat = ((lat1 + lat2) / 2) * (Math.PI / 180);
    const x = dLng * Math.cos(meanLat);
    total += Math.sqrt(dLat * dLat + x * x) * 6371000;
  }
  return Math.round(total);
}

/**
 * `start_date_local_raw` is the local wall clock expressed as an epoch, so
 * rendering it as UTC gives back the wall clock — which is the convention the
 * rest of the app stores (`startDateLocal` is zone-less, suffixed Z).
 */
function resolveStart(input: WebActivityInput): { iso: string; epoch: number } | null {
  if (input.startDateLocal) {
    const epoch = Date.parse(input.startDateLocal);
    if (Number.isFinite(epoch)) {
      return { iso: new Date(epoch).toISOString().replace(/\.\d{3}Z$/, "Z"), epoch };
    }
  }
  if (typeof input.startDateLocalRaw === "number" && Number.isFinite(input.startDateLocalRaw)) {
    const epoch = input.startDateLocalRaw * 1000;
    return { iso: new Date(epoch).toISOString().replace(/\.\d{3}Z$/, "Z"), epoch };
  }
  return null;
}

export type NormalizeResult =
  | { ok: true; activity: StoredActivity }
  | { ok: false; id: number; reason: string };

export function normalizeWebActivity(
  input: WebActivityInput,
  toleranceMeters = DEFAULT_TOLERANCE_METERS
): NormalizeResult {
  const id = Number(input.id);
  if (!Number.isFinite(id)) return { ok: false, id: 0, reason: "invalid id" };

  const raw = input.latlng;
  if (!Array.isArray(raw) || raw.length < 2) {
    return { ok: false, id, reason: "no GPS trace" };
  }

  // Streams are [lat, lng]; everything downstream is [lng, lat].
  const coords: [number, number][] = [];
  for (const point of raw) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const lat = Number(point[0]);
    const lng = Number(point[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat === 0 && lng === 0) continue;
    coords.push([lng, lat]);
  }
  if (coords.length < 2) return { ok: false, id, reason: "no usable coordinates" };

  const start = resolveStart(input);
  if (!start) return { ok: false, id, reason: "missing start date" };

  // Distance from the full-resolution stream, before simplification throws
  // detail away — the last cumulative value is the total.
  const distanceStream = input.distanceStream;
  const distance =
    Array.isArray(distanceStream) && distanceStream.length > 0
      ? Math.round(Number(distanceStream[distanceStream.length - 1]) || 0)
      : haversineLength(coords);

  const simplified = simplify(coords, toleranceMeters);

  return {
    ok: true,
    activity: {
      id,
      name: (input.name ?? "").trim() || `Activity ${id}`,
      sportType: normalizeSportType(input.type),
      startDateLocal: start.iso,
      startEpoch: start.epoch,
      distance,
      elevation: elevationGain(input.altitudeStream),
      movingTime: Math.round(Number(input.movingTime) || 0),
      commute: Boolean(input.commute),
      trainer: Boolean(input.trainer),
      polyline: encodePolyline(simplified),
      bbox: bboxOf(simplified),
    },
  };
}
