import { NextRequest, NextResponse } from "next/server";
import { getPlayerActiveInjuryContext } from "@/lib/api";

function makeJsonSafe(value: any): any {
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(makeJsonSafe);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, makeJsonSafe(val)])
    );
  }

  return value;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playerIdRaw = searchParams.get("playerId") || searchParams.get("player_id");
    const gameDate = searchParams.get("gameDate") || searchParams.get("game_date") || searchParams.get("date");

    if (!playerIdRaw || !gameDate) {
      return NextResponse.json(
        { ok: false, count: 0, rows: [], error: "Faltan parámetros: playerId y gameDate" },
        { status: 400 }
      );
    }

    const playerId = Number(playerIdRaw);
    if (!Number.isFinite(playerId)) {
      return NextResponse.json(
        { ok: false, count: 0, rows: [], error: "playerId inválido" },
        { status: 400 }
      );
    }

    const rows = await getPlayerActiveInjuryContext(playerId, String(gameDate).slice(0, 10));
    const safeRows = makeJsonSafe(rows);

    return NextResponse.json({ ok: true, count: safeRows.length, rows: safeRows });
  } catch (error: any) {
    console.error("GET /api/active-injury-context error:", error);
    return NextResponse.json(
      { ok: false, count: 0, rows: [], error: error?.message ?? "Error leyendo contexto de bajas activas" },
      { status: 200 }
    );
  }
}
