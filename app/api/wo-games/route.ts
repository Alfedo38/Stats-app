import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

function makeJsonSafe(value: any): any {
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(makeJsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, makeJsonSafe(val)]));
  }
  return value;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playerIdRaw = searchParams.get("playerId") || searchParams.get("player_id");
    const absentTeammate = searchParams.get("absentTeammate") || searchParams.get("absent_teammate");
    const limitRaw = searchParams.get("limit");

    const playerId = Number(playerIdRaw);
    const limit = Math.min(Math.max(Number(limitRaw || 120), 1), 300);

    if (!Number.isFinite(playerId) || !absentTeammate?.trim()) {
      return NextResponse.json(
        { ok: false, count: 0, rows: [], error: "Faltan parámetros: playerId y absentTeammate" },
        { status: 400 }
      );
    }

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT *
      FROM public.v_ludo_wo_games_modal
      WHERE player_id = $1
        AND absent_teammate ILIKE $2
      ORDER BY game_date DESC NULLS LAST
      LIMIT $3
      `,
      playerId,
      absentTeammate,
      limit
    );

    const safeRows = makeJsonSafe(rows);
    return NextResponse.json({ ok: true, count: safeRows.length, rows: safeRows });
  } catch (error: any) {
    console.error("GET /api/wo-games error:", error);
    return NextResponse.json(
      { ok: false, count: 0, rows: [], error: error?.message || "Error leyendo partidos W/O" },
      { status: 200 }
    );
  }
}
