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

function has(cols: Set<string>, name: string) {
  return cols.has(name.toLowerCase());
}

function maxText(cols: Set<string>, col: string, alias = col) {
  return has(cols, col) ? `MAX(${col})::text AS ${alias}` : `NULL::text AS ${alias}`;
}

function avgNum(cols: Set<string>, col: string, alias: string, digits = 1) {
  return has(cols, col) ? `ROUND(AVG(${col})::numeric, ${digits}) AS ${alias}` : `NULL::numeric AS ${alias}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playerIdRaw = searchParams.get("playerId") || searchParams.get("player_id");
    const q = String(searchParams.get("q") || "").trim();
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 20), 1), 50);
    const playerId = Number(playerIdRaw);

    if (!Number.isFinite(playerId)) {
      return NextResponse.json(
        { ok: false, count: 0, rows: [], error: "playerId inválido" },
        { status: 400 }
      );
    }

    const colRows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'v_ludo_wo_games_modal'
      `
    );

    const cols = new Set((colRows || []).map((r) => String(r.column_name).toLowerCase()));

    if (!has(cols, "player_id") || !has(cols, "absent_teammate")) {
      return NextResponse.json({
        ok: false,
        count: 0,
        rows: [],
        error: "La vista public.v_ludo_wo_games_modal necesita player_id y absent_teammate",
      });
    }

    const ptsCol = has(cols, "pts") ? "pts" : has(cols, "avg_pts") ? "avg_pts" : null;
    const rebCol = has(cols, "reb") ? "reb" : has(cols, "avg_reb") ? "avg_reb" : null;
    const astCol = has(cols, "ast") ? "ast" : has(cols, "avg_ast") ? "avg_ast" : null;
    const praCol = has(cols, "pra") ? "pra" : has(cols, "avg_pra") ? "avg_pra" : null;
    const minCol = has(cols, "min_clean") ? "min_clean" : has(cols, "min") ? "min" : has(cols, "minutes") ? "minutes" : null;
    const fg3mCol = has(cols, "fg3m") ? "fg3m" : has(cols, "avg_3pm") ? "avg_3pm" : null;

    const selectParts = [
      has(cols, "game_date") ? "MAX(game_date)::date AS game_date" : "NULL::date AS game_date",
      maxText(cols, "matchup"),
      "player_id",
      maxText(cols, "target_player"),
      maxText(cols, "team_abbreviation"),
      maxText(cols, "team_name"),
      "absent_teammate",
      maxText(cols, "absent_status", "absent_status"),
      has(cols, "absent_importance") ? "COALESCE(MAX(absent_importance)::text, 'COMPAÑERO') AS absent_importance" : "'COMPAÑERO'::text AS absent_importance",
      has(cols, "absent_importance_score") ? "COALESCE(MAX(absent_importance_score), 0) AS absent_importance_score" : "0::int AS absent_importance_score",
      `CASE WHEN COUNT(*) >= 30 THEN 'HIGH' WHEN COUNT(*) >= 10 THEN 'MEDIUM' ELSE 'LOW' END AS sample_confidence`,
      "COUNT(*)::bigint AS games",
      minCol ? `ROUND(AVG(${minCol})::numeric, 1) AS avg_min` : "NULL::numeric AS avg_min",
      ptsCol ? `ROUND(AVG(${ptsCol})::numeric, 1) AS avg_pts` : "NULL::numeric AS avg_pts",
      rebCol ? `ROUND(AVG(${rebCol})::numeric, 1) AS avg_reb` : "NULL::numeric AS avg_reb",
      astCol ? `ROUND(AVG(${astCol})::numeric, 1) AS avg_ast` : "NULL::numeric AS avg_ast",
      praCol ? `ROUND(AVG(${praCol})::numeric, 1) AS avg_pra` : "NULL::numeric AS avg_pra",
      has(cols, "pr") ? "ROUND(AVG(pr)::numeric, 1) AS avg_pr" : "NULL::numeric AS avg_pr",
      has(cols, "pa") ? "ROUND(AVG(pa)::numeric, 1) AS avg_pa" : "NULL::numeric AS avg_pa",
      has(cols, "ra") ? "ROUND(AVG(ra)::numeric, 1) AS avg_ra" : "NULL::numeric AS avg_ra",
      fg3mCol ? `ROUND(AVG(${fg3mCol})::numeric, 1) AS avg_3pm` : "NULL::numeric AS avg_3pm",
      avgNum(cols, "usage_pct", "avg_usage_pct", 3),
      avgNum(cols, "touches", "avg_touches", 1),
      avgNum(cols, "potential_ast", "avg_potential_ast", 1),
      avgNum(cols, "rebound_chances", "avg_rebound_chances", 1),
      has(cols, "game_date") ? "MIN(game_date)::date AS first_game" : "NULL::date AS first_game",
      has(cols, "game_date") ? "MAX(game_date)::date AS last_game" : "NULL::date AS last_game",
    ];

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        ${selectParts.join(",\n        ")}
      FROM public.v_ludo_wo_games_modal
      WHERE player_id::text = $1::text
        AND ($2 = '' OR absent_teammate ILIKE '%' || $2 || '%')
      GROUP BY player_id, absent_teammate
      ORDER BY avg_min DESC NULLS LAST, games DESC, avg_pra DESC NULLS LAST
      LIMIT $3
      `,
      String(playerId),
      q,
      limit
    );

    const safeRows = makeJsonSafe(rows);
    return NextResponse.json({ ok: true, count: safeRows.length, rows: safeRows });
  } catch (error: any) {
    console.error("GET /api/wo-teammates error:", error);
    return NextResponse.json(
      { ok: false, count: 0, rows: [], error: error?.message || "Error leyendo compañeros W/O" },
      { status: 200 }
    );
  }
}
