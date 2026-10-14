import { NextResponse, type NextRequest } from "next/server";
import { setAthlete } from "@/lib/store";
import { appUrl, exchangeCode } from "@/lib/strava";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const error = params.get("error");
  const code = params.get("code");
  const scope = params.get("scope") ?? "";

  if (error) {
    return NextResponse.redirect(`${appUrl(request)}/?error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${appUrl(request)}/?error=missing_code`);
  }
  if (!scope.includes("activity:read_all")) {
    return NextResponse.redirect(`${appUrl(request)}/?error=missing_activity_scope`);
  }

  try {
    const { athlete } = await exchangeCode(code, scope);
    if (athlete) setAthlete(athlete);
  } catch (e) {
    const message = e instanceof Error ? e.message : "token_exchange_failed";
    return NextResponse.redirect(`${appUrl(request)}/?error=${encodeURIComponent(message)}`);
  }

  return NextResponse.redirect(`${appUrl(request)}/?connected=1`);
}
