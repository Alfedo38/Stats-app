import { withAuth } from '@/lib/auth/server';
// app/api/schedule/route.ts
import { NextResponse } from "next/server";
import { getSchedule } from "@/lib/api";

export const GET = withAuth(handleGET);
async function handleGET() {
  try {
    const games = await getSchedule();
    return NextResponse.json({ games });
  } catch (err: any) {
    console.error("[/api/schedule] Error:", err);
    return NextResponse.json({ games: [] });
  }
}
