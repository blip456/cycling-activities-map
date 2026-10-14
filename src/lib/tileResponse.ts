export const TILE_CORS = {
  // Web-based mapping software fetches these cross-origin.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export type TileParams = Promise<{ z: string; x: string; y: string }>;

/** Validates z/x/y route segments and returns `render`'s PNG as the response. */
export async function tileResponse(
  params: TileParams,
  render: (z: number, x: number, y: number) => Buffer,
  cacheControl: string
): Promise<Response> {
  const { z: zRaw, x: xRaw, y: yRaw } = await params;

  const z = Number(zRaw);
  const x = Number(xRaw);
  // The y segment carries the file extension: "1234.png"
  const y = Number(yRaw.replace(/\.(png|webp|jpg|jpeg)$/i, ""));

  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
    return new Response("Bad tile coordinates", { status: 400, headers: TILE_CORS });
  }
  if (z < 0 || z > 22) {
    return new Response("Zoom out of range", { status: 400, headers: TILE_CORS });
  }

  const max = 2 ** z;
  if (y < 0 || y >= max) {
    return new Response("Tile y out of range", { status: 400, headers: TILE_CORS });
  }
  // Wrap x so panning across the antimeridian doesn't produce 400s.
  const wrappedX = ((x % max) + max) % max;

  try {
    const png = render(z, wrappedX, y);
    return new Response(new Uint8Array(png), {
      headers: {
        ...TILE_CORS,
        "Content-Type": "image/png",
        "Cache-Control": cacheControl,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Tile render failed";
    return new Response(message, { status: 500, headers: TILE_CORS });
  }
}
