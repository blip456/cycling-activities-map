import type { SquadratsSummary } from "./squadrats";
import type { Athlete, StoredActivity } from "./types";

export type StatusResponse = {
  credentialsConfigured: boolean;
  connected: boolean;
  scope: string | null;
  athlete: Athlete | null;
  appUrl: string;
  activityCount: number;
  commuteCount: number;
  lastSyncAt: string | null;
  lastImportAt: string | null;
  dataVersion: number;
  dateRange: { from: string | null; to: string | null };
  bounds: { maxDistanceKm: number; maxElevation: number };
  sportTypes: { type: string; count: number }[];
  squadrats: SquadratsSummary;
};

export type ActivitiesResponse = {
  dataVersion: number;
  activities: StoredActivity[];
};
