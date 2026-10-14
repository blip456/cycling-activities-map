import { NextResponse } from "next/server";
import { deleteTokens } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST() {
  deleteTokens();
  return NextResponse.json({ ok: true });
}
