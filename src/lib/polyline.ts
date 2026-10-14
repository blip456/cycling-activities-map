/**
 * Google encoded polyline algorithm (precision 5) — the format Strava uses for
 * `map.summary_polyline`. Isomorphic: used by the tile renderer on the server
 * and by the map on the client.
 */

/** Decodes to a flat array of [lng, lat] pairs (GeoJSON order). */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lng * 1e-5, lat * 1e-5]);
  }

  return points;
}

function encodeSigned(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let out = "";
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return out + String.fromCharCode(v + 63);
}

/** Inverse of `decodePolyline`. Takes [lng, lat] pairs (GeoJSON order). */
export function encodePolyline(coords: [number, number][]): string {
  let lastLat = 0;
  let lastLng = 0;
  let out = "";
  for (const [lng, lat] of coords) {
    const la = Math.round(lat * 1e5);
    const ln = Math.round(lng * 1e5);
    out += encodeSigned(la - lastLat) + encodeSigned(ln - lastLng);
    lastLat = la;
    lastLng = ln;
  }
  return out;
}

/**
 * Ramer–Douglas–Peucker on lng/lat, with longitude scaled by cos(lat) so the
 * tolerance is roughly metric in both axes. `toleranceMeters` of 0 disables it.
 */
export function simplify(
  coords: [number, number][],
  toleranceMeters: number
): [number, number][] {
  if (toleranceMeters <= 0 || coords.length < 3) return coords;

  const meanLat = (coords[0][1] + coords[coords.length - 1][1]) / 2;
  const kx = 111320 * Math.cos((meanLat * Math.PI) / 180);
  const ky = 110540;
  const tol2 = toleranceMeters * toleranceMeters;

  const keep = new Uint8Array(coords.length);
  keep[0] = 1;
  keep[coords.length - 1] = 1;

  // Iterative to avoid blowing the stack on long tracks.
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    if (last - first < 2) continue;

    const ax = coords[first][0] * kx;
    const ay = coords[first][1] * ky;
    const bx = coords[last][0] * kx;
    const by = coords[last][1] * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const segLen2 = dx * dx + dy * dy;

    let maxDist2 = -1;
    let maxIndex = first;

    for (let i = first + 1; i < last; i++) {
      const px = coords[i][0] * kx;
      const py = coords[i][1] * ky;
      let dist2: number;
      if (segLen2 === 0) {
        dist2 = (px - ax) ** 2 + (py - ay) ** 2;
      } else {
        let t = ((px - ax) * dx + (py - ay) * dy) / segLen2;
        t = Math.max(0, Math.min(1, t));
        dist2 = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
      }
      if (dist2 > maxDist2) {
        maxDist2 = dist2;
        maxIndex = i;
      }
    }

    if (maxDist2 > tol2) {
      keep[maxIndex] = 1;
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }

  return coords.filter((_, i) => keep[i] === 1);
}

/**
 * Approximate point count without decoding. Encoded points average ~4
 * characters at precision 5 for GPS-spaced samples (measured against real
 * summary polylines), which is close enough for a download-size estimate.
 */
export function estimatePoints(polyline: string): number {
  return Math.round(polyline.length / 4);
}

export type BBox = [number, number, number, number]; // minLng, minLat, maxLng, maxLat

export function bboxOf(coords: [number, number][]): BBox {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

export function bboxUnion(boxes: BBox[]): BBox | null {
  if (boxes.length === 0) return null;
  const out: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    if (b[0] < out[0]) out[0] = b[0];
    if (b[1] < out[1]) out[1] = b[1];
    if (b[2] > out[2]) out[2] = b[2];
    if (b[3] > out[3]) out[3] = b[3];
  }
  return out;
}
