import type { BBox } from "./polyline";

export type StoredActivity = {
  id: number;
  name: string;
  sportType: string;
  /** Wall-clock local start time, ISO 8601 without zone offset, e.g. 2024-05-03T18:12:07Z */
  startDateLocal: string;
  /** Epoch ms of `startDateLocal` interpreted as UTC — use for date-range filtering. */
  startEpoch: number;
  /** metres */
  distance: number;
  /** metres of climbing */
  elevation: number;
  /** seconds */
  movingTime: number;
  commute: boolean;
  trainer: boolean;
  /** Google-encoded polyline (Strava's `map.summary_polyline`). */
  polyline: string;
  bbox: BBox;
};

export type Athlete = {
  id: number;
  firstname: string;
  lastname: string;
  username: string | null;
  profile: string | null;
};

export type ActivityStore = {
  version: 1;
  athlete: Athlete | null;
  /** Last successful OAuth-API sync. */
  lastSyncAt: string | null;
  /** Last successful import from the browser extension. */
  lastImportAt: string | null;
  /** Bumped on every write; used to key caches (tiles) so they invalidate on sync. */
  dataVersion: number;
  activities: StoredActivity[];
};

export type Tokens = {
  accessToken: string;
  refreshToken: string;
  /** epoch seconds */
  expiresAt: number;
  scope: string;
};
