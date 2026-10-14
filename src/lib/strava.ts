import { bboxOf, decodePolyline } from "./polyline";
import { readTokens, writeTokens } from "./store";
import type { Athlete, StoredActivity, Tokens } from "./types";

const OAUTH_BASE = "https://www.strava.com/oauth";
const API_BASE = "https://www.strava.com/api/v3";

/** Read access to *all* activities, including ones marked "Only me". */
export const SCOPE = "read,activity:read_all";

export function credentials() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

/**
 * Base URL of this app. `APP_URL` wins if set; otherwise we mirror the origin
 * the request came in on, so running `next dev -p 3111` still produces working
 * callback and tile URLs. Strava only validates the callback *domain*
 * (localhost), so the port is free to change.
 */
export function appUrl(request?: { nextUrl: URL }) {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (request) return request.nextUrl.origin;
  return "http://localhost:3000";
}

export function authorizeUrl(request?: { nextUrl: URL }) {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId ?? "",
    redirect_uri: `${appUrl(request)}/api/auth/callback`,
    response_type: "code",
    approval_prompt: "auto",
    scope: SCOPE,
  });
  return `${OAUTH_BASE}/authorize?${params}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
  athlete?: {
    id: number;
    firstname: string;
    lastname: string;
    username: string | null;
    profile: string | null;
  };
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...body }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Strava token request failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function exchangeCode(code: string, scope: string) {
  const data = await tokenRequest({ code, grant_type: "authorization_code" });
  const tokens: Tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    scope: data.scope ?? scope,
  };
  writeTokens(tokens);
  const athlete: Athlete | null = data.athlete
    ? {
        id: data.athlete.id,
        firstname: data.athlete.firstname,
        lastname: data.athlete.lastname,
        username: data.athlete.username,
        profile: data.athlete.profile,
      }
    : null;
  return { tokens, athlete };
}

/** Returns a valid access token, refreshing (and persisting) it when near expiry. */
export async function accessToken(): Promise<string> {
  const tokens = readTokens();
  if (!tokens) throw new Error("Not connected to Strava");

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (tokens.expiresAt - nowSeconds > 120) return tokens.accessToken;

  const data = await tokenRequest({
    refresh_token: tokens.refreshToken,
    grant_type: "refresh_token",
  });
  const refreshed: Tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    scope: tokens.scope,
  };
  writeTokens(refreshed);
  return refreshed.accessToken;
}

export type RateLimit = {
  shortTermUsage: number;
  shortTermLimit: number;
  dailyUsage: number;
  dailyLimit: number;
};

function parseRateLimit(headers: Headers): RateLimit | null {
  const limit = headers.get("x-readratelimit-limit") ?? headers.get("x-ratelimit-limit");
  const usage = headers.get("x-readratelimit-usage") ?? headers.get("x-ratelimit-usage");
  if (!limit || !usage) return null;
  const [sl, dl] = limit.split(",").map((n) => Number(n.trim()));
  const [su, du] = usage.split(",").map((n) => Number(n.trim()));
  return { shortTermLimit: sl, dailyLimit: dl, shortTermUsage: su, dailyUsage: du };
}

export type StravaSummaryActivity = {
  id: number;
  name: string;
  sport_type?: string;
  type?: string;
  start_date_local: string;
  distance: number;
  total_elevation_gain: number;
  moving_time: number;
  commute?: boolean;
  trainer?: boolean;
  map?: { summary_polyline?: string | null };
};

export class RateLimitError extends Error {
  constructor(public rateLimit: RateLimit | null) {
    super("Strava rate limit reached");
    this.name = "RateLimitError";
  }
}

/** One page of `/athlete/activities`, newest first. `after` is epoch seconds. */
export async function fetchActivityPage(opts: {
  token: string;
  page: number;
  perPage: number;
  after?: number | null;
}): Promise<{ activities: StravaSummaryActivity[]; rateLimit: RateLimit | null }> {
  const params = new URLSearchParams({
    page: String(opts.page),
    per_page: String(opts.perPage),
  });
  if (opts.after) params.set("after", String(opts.after));

  const res = await fetch(`${API_BASE}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${opts.token}` },
    cache: "no-store",
  });
  const rateLimit = parseRateLimit(res.headers);

  if (res.status === 429) throw new RateLimitError(rateLimit);
  if (!res.ok) {
    throw new Error(`Strava activities request failed (${res.status}): ${await res.text()}`);
  }
  return { activities: (await res.json()) as StravaSummaryActivity[], rateLimit };
}

export async function fetchAthlete(token: string): Promise<Athlete> {
  const res = await fetch(`${API_BASE}/athlete`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Strava athlete request failed (${res.status})`);
  const a = (await res.json()) as Athlete;
  return {
    id: a.id,
    firstname: a.firstname,
    lastname: a.lastname,
    username: a.username ?? null,
    profile: a.profile ?? null,
  };
}

/**
 * Normalises a Strava summary activity into our stored shape.
 * Returns null for activities with no GPS trace (indoor rides, gym sessions, …)
 * since they can't be drawn on a map.
 */
export function normalizeActivity(a: StravaSummaryActivity): StoredActivity | null {
  const polyline = a.map?.summary_polyline;
  if (!polyline) return null;

  const coords = decodePolyline(polyline);
  if (coords.length < 2) return null;

  return {
    id: a.id,
    name: a.name,
    sportType: a.sport_type ?? a.type ?? "Workout",
    startDateLocal: a.start_date_local,
    startEpoch: Date.parse(a.start_date_local),
    distance: a.distance ?? 0,
    elevation: a.total_elevation_gain ?? 0,
    movingTime: a.moving_time ?? 0,
    commute: Boolean(a.commute),
    trainer: Boolean(a.trainer),
    polyline,
    bbox: bboxOf(coords),
  };
}
