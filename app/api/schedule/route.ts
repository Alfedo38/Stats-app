// app/api/schedule/route.ts
import { NextResponse } from "next/server";
import { getSchedule } from "@/lib/api";

export async function GET() {
  try {
    const games = await getSchedule();
    return NextResponse.json({ games });
  } catch (err: any) {
    console.error("[/api/schedule] Error:", err);
    return NextResponse.json({ games: [] });
  }
}
