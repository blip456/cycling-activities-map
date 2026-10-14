import { filtersToParams, type Filters } from "./filters";

/** Look of the activity XYZ tiles — the map's own lines use category colours instead. */
export type OverlayStyle = {
  color: string;
  weight: number;
  glow: boolean;
  opacity: number;
};

export const DEFAULT_OVERLAY_STYLE: OverlayStyle = {
  color: "#fc5200",
  weight: 1,
  glow: true,
  opacity: 0.9,
};

/** Filters + style as tile query params — also the body pushed to /api/tiles/live. */
export function overlayParams(filters: Filters, style: OverlayStyle): URLSearchParams {
  const params = filtersToParams(filters);
  params.set("color", style.color.replace("#", ""));
  params.set("weight", String(style.weight));
  params.set("opacity", String(style.opacity));
  if (!style.glow) params.set("glow", "0");
  return params;
}

export function overlayTileUrl(
  appUrl: string,
  filters: Filters,
  style: OverlayStyle,
  dataVersion: number
): string {
  const params = overlayParams(filters, style);
  // Cache-buster so mapping software picks up freshly synced rides.
  params.set("v", String(dataVersion));
  return `${appUrl}/api/tiles/{z}/{x}/{y}.png?${params.toString()}`;
}

/** Fixed URL whose tiles follow whatever this UI is currently set to. */
export function liveTileUrl(appUrl: string): string {
  return `${appUrl}/api/tiles/live/{z}/{x}/{y}.png`;
}
