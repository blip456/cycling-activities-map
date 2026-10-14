import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, credentials } from "@/lib/strava";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!credentials().configured) {
    return NextResponse.json(
      { error: "STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET are not set in .env.local" },
      { status: 500 }
    );
  }
  return NextResponse.redirect(authorizeUrl(request));
}
