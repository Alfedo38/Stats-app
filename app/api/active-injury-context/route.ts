import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function plain(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (typeof value.toNumber === "function") return value.toNumber();
    if (Array.isArray(value)) return value.map(plain);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = plain(v);
    return out;
  }
  return value;
}

const mem = new Map<string, { ts: number; data: any }>();
const TTL_MS = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const playerId = Number(url.searchParams.get("playerId"));
  const gameDate = url.searchParams.get("gameDate");

  if (!Number.isFinite(playerId) || !gameDate) {
    return NextResponse.json(
      { ok: false, error: "playerId y gameDate son requeridos", rows: [] },
      { status: 400 }
    );
  }

  const cacheKey = `${playerId}:${gameDate}`;
  const cached = mem.get(cacheKey);

  if (cached && Date.now() - cached.ts < TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        "X-Active-Injury-Cache": "HIT",
      },
    });
  }

  const rowsRaw = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT
      game_date,
      matchup,
      player_id,
      target_player,
      team_abbreviation,
      team_name,
      absent_teammate,
      absent_status,
      absent_importance,
      absent_importance_score,
      sample_confidence,
      games,
      avg_min,
      avg_pts,
      avg_reb,
      avg_ast,
      avg_pra,
      avg_pr,
      avg_pa,
      avg_ra,
      avg_3pm,
      avg_usage_pct,
      avg_touches,
      avg_potential_ast,
      avg_rebound_chances,
      absent_avg_min,
      absent_avg_pra,
      absent_avg_usage_pct,
      first_game,
      last_game
    FROM public.ludo_active_injury_context_cache
    WHERE player_id = $1::bigint
      AND game_date = $2::date
    ORDER BY absent_importance_score DESC, games DESC
    `,
    playerId,
    gameDate
  );

  const rows = plain(rowsRaw || []);
  const data = { ok: true, count: rows.length, rows };

  mem.set(cacheKey, { ts: Date.now(), data });

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      "X-Active-Injury-Cache": "MISS",
    },
  });
}
