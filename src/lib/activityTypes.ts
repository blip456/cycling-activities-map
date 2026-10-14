/**
 * Strava `sport_type` values grouped into the handful of categories that
 * actually matter when you're looking at a map of where you've been.
 */

export type Category = "cycling" | "running" | "walking" | "water" | "winter" | "other";

export const CATEGORY_LABELS: Record<Category, string> = {
  cycling: "Cycling",
  running: "Running",
  walking: "Walking & hiking",
  water: "Water",
  winter: "Winter",
  other: "Other",
};

export const CATEGORY_COLORS: Record<Category, string> = {
  cycling: "#fc5200", // Strava orange
  running: "#f0508c",
  walking: "#3fbf6f",
  water: "#2f9bd8",
  winter: "#7c6ff0",
  other: "#9aa4b2",
};

export const CATEGORY_ORDER: Category[] = [
  "cycling",
  "running",
  "walking",
  "water",
  "winter",
  "other",
];

const BY_TYPE: Record<string, Category> = {
  Ride: "cycling",
  GravelRide: "cycling",
  MountainBikeRide: "cycling",
  EBikeRide: "cycling",
  EMountainBikeRide: "cycling",
  VirtualRide: "cycling",
  Handcycle: "cycling",
  Velomobile: "cycling",

  Run: "running",
  TrailRun: "running",
  VirtualRun: "running",

  Hike: "walking",
  Walk: "walking",
  Snowshoe: "walking",
  Wheelchair: "walking",

  Swim: "water",
  Kayaking: "water",
  Canoeing: "water",
  Rowing: "water",
  StandUpPaddling: "water",
  Surfing: "water",
  Windsurf: "water",
  Kitesurf: "water",
  Sail: "water",

  AlpineSki: "winter",
  BackcountrySki: "winter",
  NordicSki: "winter",
  Snowboard: "winter",
  IceSkate: "winter",
  RollerSki: "winter",

  InlineSkate: "other",
  Golf: "other",
  Skateboard: "other",
  RockClimbing: "other",
};

export function categoryOf(sportType: string): Category {
  return BY_TYPE[sportType] ?? "other";
}

/** "MountainBikeRide" -> "Mountain Bike Ride" */
export function humanizeSportType(sportType: string): string {
  if (sportType === "EBikeRide") return "E-Bike Ride";
  if (sportType === "EMountainBikeRide") return "E-Mountain Bike Ride";
  return sportType.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}
