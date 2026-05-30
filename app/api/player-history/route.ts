import { NextResponse } from "next/server";
import { getPlayerHistoricalExplorer } from "@/lib/playerHistory";

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = await getPlayerHistoricalExplorer({
      playerId: body.playerId ?? null,
      playerName: body.playerName ?? null,
      market: body.market,
      line: Number(body.line),
      side: body.side === "under" ? "under" : "over",
      mode: body.mode === "all" ? "all" : "last2",
      opponent: body.opponent ?? null,
      homeAway: body.homeAway ?? null,
      minMinutes: body.minMinutes === null || body.minMinutes === undefined ? null : Number(body.minMinutes),
      woTeammate: body.woTeammate ?? null,
      limit: body.limit ?? 160,
    });

    return NextResponse.json(makeJsonSafe(data));
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Error consultando histórico del jugador" },
      { status: 500 }
    );
  }
}
