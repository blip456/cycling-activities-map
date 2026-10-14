import fs from "node:fs";
import path from "node:path";
import { EMPTY_SQUADRATS, type SquadratsStore } from "./squadrats";
import type { ActivityStore, Athlete, StoredActivity, Tokens } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const ACTIVITIES_FILE = path.join(DATA_DIR, "activities.json");
const TOKENS_FILE = path.join(DATA_DIR, "tokens.json");
const SQUADRATS_FILE = path.join(DATA_DIR, "squadrats.json");

const EMPTY: ActivityStore = {
  version: 1,
  athlete: null,
  lastSyncAt: null,
  lastImportAt: null,
  dataVersion: 0,
  activities: [],
};

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function writeAtomic(file: string, contents: string) {
  ensureDir();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, contents, "utf8");
  fs.renameSync(tmp, file);
}

// ---------------------------------------------------------------- activities

let cache: ActivityStore | null = null;

export function readStore(): ActivityStore {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(ACTIVITIES_FILE, "utf8");
    const parsed = JSON.parse(raw) as ActivityStore;
    cache = { ...EMPTY, ...parsed };
  } catch {
    cache = { ...EMPTY, activities: [] };
  }
  return cache;
}

function writeStore(next: ActivityStore) {
  cache = next;
  writeAtomic(ACTIVITIES_FILE, JSON.stringify(next));
}

/** Merges by activity id (incoming wins) and keeps newest-first ordering. */
export function upsertActivities(incoming: StoredActivity[]) {
  const store = readStore();
  const byId = new Map(store.activities.map((a) => [a.id, a]));
  for (const a of incoming) byId.set(a.id, a);
  const activities = [...byId.values()].sort((a, b) => b.startEpoch - a.startEpoch);
  writeStore({ ...store, activities, dataVersion: store.dataVersion + 1 });
}

export function setAthlete(athlete: Athlete) {
  const store = readStore();
  writeStore({ ...store, athlete });
}

export function setLastSyncAt(iso: string) {
  const store = readStore();
  writeStore({ ...store, lastSyncAt: iso, dataVersion: store.dataVersion + 1 });
}

export function setLastImportAt(iso: string) {
  const store = readStore();
  writeStore({ ...store, lastImportAt: iso, dataVersion: store.dataVersion + 1 });
}

export function clearActivities() {
  const store = readStore();
  writeStore({
    ...store,
    activities: [],
    lastSyncAt: null,
    lastImportAt: null,
    dataVersion: store.dataVersion + 1,
  });
}

/** Epoch seconds of the newest stored activity — the watermark for incremental sync. */
export function newestActivityEpochSeconds(): number | null {
  const { activities } = readStore();
  if (activities.length === 0) return null;
  return Math.max(...activities.map((a) => Math.floor(a.startEpoch / 1000)));
}

// ----------------------------------------------------------------- squadrats

let squadratsCache: SquadratsStore | null = null;

export function readSquadrats(): SquadratsStore {
  if (squadratsCache) return squadratsCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(SQUADRATS_FILE, "utf8")) as SquadratsStore;
    squadratsCache = { ...EMPTY_SQUADRATS, ...parsed };
  } catch {
    squadratsCache = EMPTY_SQUADRATS;
  }
  return squadratsCache;
}

/** Replaces the stored Squadrats data wholesale — every sync is a full snapshot. */
export function writeSquadrats(next: Pick<SquadratsStore, "uid" | "tiles" | "shapes">) {
  const current = readSquadrats();
  squadratsCache = {
    ...current,
    ...next,
    syncedAt: new Date().toISOString(),
    dataVersion: current.dataVersion + 1,
  };
  writeAtomic(SQUADRATS_FILE, JSON.stringify(squadratsCache));
}

// -------------------------------------------------------------------- tokens

let tokenCache: Tokens | null | undefined;

export function readTokens(): Tokens | null {
  if (tokenCache !== undefined) return tokenCache;
  try {
    tokenCache = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8")) as Tokens;
  } catch {
    tokenCache = null;
  }
  return tokenCache;
}

export function writeTokens(tokens: Tokens) {
  tokenCache = tokens;
  writeAtomic(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

export function deleteTokens() {
  tokenCache = null;
  try {
    fs.unlinkSync(TOKENS_FILE);
  } catch {
    /* already gone */
  }
}
