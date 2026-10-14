import { decodePolyline, simplify } from "./polyline";
import type { StoredActivity } from "./types";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type GpxOptions = {
  /** RDP tolerance in metres; 0 = keep every point Strava gave us. */
  toleranceMeters?: number;
  /** Shown in the GPX metadata block. */
  description?: string;
};

/**
 * Yields a GPX 1.1 document as string chunks — one `<trk>` per activity, so
 * mapping software shows each ride as its own selectable track.
 *
 * Note: summary polylines carry no timestamps or elevations, so tracks are
 * geometry only. That's exactly what you want as a "where have I been" backdrop.
 */
export function* buildGpx(
  activities: StoredActivity[],
  options: GpxOptions = {}
): Generator<string> {
  const tolerance = options.toleranceMeters ?? 0;

  yield `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="cycling-explorer" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `  <metadata>\n` +
    `    <name>Strava activities</name>\n` +
    (options.description ? `    <desc>${escapeXml(options.description)}</desc>\n` : "") +
    `  </metadata>\n`;

  for (const activity of activities) {
    const coords = simplify(decodePolyline(activity.polyline), tolerance);
    if (coords.length < 2) continue;

    const parts: string[] = [
      `  <trk>\n`,
      `    <name>${escapeXml(
        `${activity.startDateLocal.slice(0, 10)} · ${activity.name}`
      )}</name>\n`,
      `    <type>${escapeXml(activity.sportType)}</type>\n`,
      `    <trkseg>\n`,
    ];
    for (const [lng, lat] of coords) {
      parts.push(`      <trkpt lat="${lat.toFixed(5)}" lon="${lng.toFixed(5)}"/>\n`);
    }
    parts.push(`    </trkseg>\n`, `  </trk>\n`);
    yield parts.join("");
  }

  yield `</gpx>\n`;
}
