import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function plain(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    if (Array.isArray((value as any).d) && typeof (value as any).toString === "function") {
      const n = Number((value as any).toString());
      return Number.isFinite(n) ? n : null;
    }
    if (typeof (value as any).toNumber === "function") {
      const n = (value as any).toNumber();
      return Number.isFinite(n) ? n : null;
    }
    if (Array.isArray(value)) return value.map(plain);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "function") continue;
      out[k] = plain(v);
    }
    return out;
  }

  return value;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playerId = Number(searchParams.get("playerId") || searchParams.get("player_id"));
    const limitRaw = Number(searchParams.get("limit") || 1500);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 3000) : 1500;

    if (!Number.isFinite(playerId)) {
      return NextResponse.json(
        { ok: false, rows: [], count: 0, error: "playerId inválido" },
        { status: 400 }
      );
    }

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        game_id,
        game_date,
        split_code,
        player_id,
        player_name,
        team_abbreviation,
        min_text,
        pts,
        reb,
        ast,
        oreb,
        dreb,
        stl,
        blk,
        tov,
        pf,
        fgm,
        fga,
        fg3m,
        fg3a,
        ftm,
        fta,
        pr,
        pa,
        ra,
        pra,
        (COALESCE(stl, 0) + COALESCE(blk, 0)) AS stl_blk
      FROM public.player_period_splits_front_v2_cache
      WHERE player_id = $1::bigint
      ORDER BY game_date DESC, split_code ASC
      LIMIT $2::int
      `,
      playerId,
      limit
    );

    const safeRows = plain(rows || []);

    return NextResponse.json(
      { ok: true, count: safeRows.length, rows: safeRows },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          "X-Player-Period-Splits": "cache",
        },
      }
    );
  } catch (error: any) {
    console.error("GET /api/player-period-splits error:", error);
    return NextResponse.json(
      { ok: false, count: 0, rows: [], error: error?.message || "Error leyendo period splits" },
      { status: 200 }
    );
  }
}
