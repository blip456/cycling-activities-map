import fs from "node:fs";
import path from "node:path";

/**
 * What the sidebar currently shows, per overlay. The UI pushes it on every
 * change, so each live tile URL is one fixed URL that always renders whatever
 * the sidebar is set to. Persisted so it survives a restart.
 */
export type LiveOverlayName = "activities" | "squadrats";

export type LiveOverlay = {
  /** Query string in the same format the overlay's fixed tile URL uses. */
  query: string;
  updatedAt: string | null;
};

const FILES: Record<LiveOverlayName, string> = {
  activities: path.join(process.cwd(), "data", "live-overlay.json"),
  squadrats: path.join(process.cwd(), "data", "live-squadrats.json"),
};

const cache = new Map<LiveOverlayName, LiveOverlay>();

export function readLiveOverlay(name: LiveOverlayName): LiveOverlay {
  const hit = cache.get(name);
  if (hit) return hit;
  let overlay: LiveOverlay;
  try {
    const raw = JSON.parse(fs.readFileSync(FILES[name], "utf8")) as Partial<LiveOverlay>;
    overlay = { query: raw.query ?? "", updatedAt: raw.updatedAt ?? null };
  } catch {
    overlay = { query: "", updatedAt: null };
  }
  cache.set(name, overlay);
  return overlay;
}

export function writeLiveOverlay(name: LiveOverlayName, query: string): LiveOverlay {
  const current = readLiveOverlay(name);
  if (current.query === query) return current;
  const next = { query, updatedAt: new Date().toISOString() };
  cache.set(name, next);
  const file = FILES[name];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(next), "utf8");
  fs.renameSync(`${file}.tmp`, file);
  return next;
}
