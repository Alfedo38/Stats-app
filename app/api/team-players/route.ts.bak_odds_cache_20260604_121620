import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CacheEntry = {
  expiresAt: number;
  value: any[];
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const HTTP_MAX_AGE = 60;
const HTTP_S_MAXAGE = 300;
const HTTP_STALE = 600;

const globalAny = globalThis as any;
const TEAM_PLAYERS_CACHE: Map<string, CacheEntry> =
  globalAny.__MOSK_TEAM_PLAYERS_CACHE__ ?? new Map<string, CacheEntry>();
const TEAM_PLAYERS_INFLIGHT: Map<string, Promise<any[]>> =
  globalAny.__MOSK_TEAM_PLAYERS_INFLIGHT__ ?? new Map<string, Promise<any[]>>();

globalAny.__MOSK_TEAM_PLAYERS_CACHE__ = TEAM_PLAYERS_CACHE;
globalAny.__MOSK_TEAM_PLAYERS_INFLIGHT__ = TEAM_PLAYERS_INFLIGHT;

function jsonSafe(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "function") return undefined;

  if (typeof value === "object") {
    const anyValue = value as any;

    if (
      Array.isArray(anyValue.d) &&
      typeof anyValue.s !== "undefined" &&
      typeof anyValue.e !== "undefined" &&
      typeof anyValue.toString === "function"
    ) {
      const n = Number(anyValue.toString());
      return Number.isFinite(n) ? n : null;
    }

    if (typeof anyValue.toNumber === "function") {
      const n = anyValue.toNumber();
      return Number.isFinite(n) ? n : null;
    }

    if (Array.isArray(value)) return value.map(jsonSafe);

    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "function") continue;
      out[k] = jsonSafe(v);
    }
    return out;
  }

  return value;
}

function normalizeTeamAbbr(v: any) {
  return String(v || "").trim().toUpperCase();
}

function normalizePlayerName(v: any) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(v: any, fb: number | null = null) {
  if (v === null || v === undefined || v === "") return fb;
  if (typeof v === "object") {
    if (typeof v.toNumber === "function") return v.toNumber();
    if (typeof v.toString === "function") {
      const n = Number(v.toString());
      return Number.isFinite(n) ? n : fb;
    }
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function statToPropType(stat: string) {
  const s = String(stat || "pts").trim().toLowerCase();
  const map: Record<string, string> = {
    pts: "PTS",
    points: "PTS",
    reb: "REB",
    rebounds: "REB",
    ast: "AST",
    assists: "AST",
    "pts+ast": "PA",
    pa: "PA",
    "pts+reb": "PR",
    pr: "PR",
    "reb+ast": "RA",
    ra: "RA",
    "pts+reb+ast": "PRA",
    pra: "PRA",
    fgm: "FGM",
    fga: "FGA",
    fg3m: "3PT",
    "3pt": "3PT",
    "3ptm": "3PT",
    fg3a: "FG3A",
    "3pta": "FG3A",
    ftm: "FTM",
    fta: "FTA",
    stl: "STL",
    blk: "BLK",
    "stl+blk": "STL+BLK",
    tov: "TOV",
    to: "TOV",
    pf: "PF",
  };
  return map[s] || s.toUpperCase();
}

function getStatValue(row: any, stat: string) {
  const key = statToPropType(stat);
  const lower = key.toLowerCase().replace("+", "_");

  const aliases: Record<string, string[]> = {
    PTS: ["pts"],
    REB: ["reb"],
    AST: ["ast"],
    PA: ["pa"],
    PR: ["pr"],
    RA: ["ra"],
    PRA: ["pra"],
    FGM: ["fgm"],
    FGA: ["fga"],
    "3PT": ["fg3m", "3pt", "3ptm"],
    FG3A: ["fg3a", "3pta"],
    FTM: ["ftm"],
    FTA: ["fta"],
    STL: ["stl"],
    BLK: ["blk"],
    "STL+BLK": ["stl_blk"],
    TOV: ["tov", "to"],
    PF: ["pf"],
  };

  for (const k of aliases[key] || [lower]) {
    const n = toNumber(row?.[k], NaN);
    if (Number.isFinite(n as number)) return n as number;
  }

  return 0;
}

async function loadTeamPlayersFast(teams: string[], stat: string, book: string) {
  const cleanTeams = Array.from(new Set((teams || []).map(normalizeTeamAbbr).filter(Boolean)));
  if (cleanTeams.length === 0) return [];

  const propType = statToPropType(stat);

  const rosterRows = await prisma.$queryRaw<any[]>(Prisma.sql`
    WITH latest AS (
      SELECT DISTINCT ON (player_id)
        player_id::bigint AS player_id,
        player_name::text AS player_name,
        UPPER(team_abbreviation::text) AS team_abbreviation,
        game_date
      FROM public.player_page_game_fact_cache
      WHERE player_id IS NOT NULL
        AND NULLIF(team_abbreviation::text, '') IS NOT NULL
      ORDER BY player_id, game_date DESC NULLS LAST
    )
    SELECT
      player_id,
      player_name,
      team_abbreviation
    FROM latest
    WHERE team_abbreviation IN (${Prisma.join(cleanTeams)})
    ORDER BY team_abbreviation ASC, player_name ASC
  `);

  const playerIds = Array.from(
    new Set((rosterRows || []).map((r) => Number(r.player_id)).filter(Number.isFinite)),
  );

  if (playerIds.length === 0) return [];

  const recentRows = await prisma.$queryRaw<any[]>(Prisma.sql`
    WITH ranked AS (
      SELECT
        player_id::bigint AS player_id,
        game_date,
        pts, reb, ast,
        fgm, fga, fg3m, fg3a,
        ftm, fta,
        stl, blk, tov, pf,
        pra, pr, pa, ra, stl_blk,
        ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY game_date DESC NULLS LAST) AS rn
      FROM public.player_page_game_fact_cache
      WHERE player_id IN (${Prisma.join(playerIds)})
    )
    SELECT *
    FROM ranked
    WHERE rn <= 10
    ORDER BY player_id ASC, game_date DESC NULLS LAST
  `);

  const logsByPlayer = new Map<number, any[]>();
  for (const row of recentRows || []) {
    const id = Number(row.player_id);
    if (!Number.isFinite(id)) continue;
    if (!logsByPlayer.has(id)) logsByPlayer.set(id, []);
    logsByPlayer.get(id)!.push(row);
  }

  const normalizedNames = Array.from(
    new Set((rosterRows || []).map((p) => normalizePlayerName(p.player_name)).filter(Boolean)),
  );

  const lineByPlayerNorm = new Map<string, number>();
  if (normalizedNames.length > 0) {
    try {
      const oddsRows = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT DISTINCT ON (player_norm)
          player_norm,
          COALESCE(model_line, threshold) AS line,
          scraped_at_utc
        FROM public.latest_player_prop_odds
        WHERE lower(book) = ${book}
          AND stat_key = ${propType}
          AND player_norm IN (${Prisma.join(normalizedNames)})
        ORDER BY player_norm, scraped_at_utc DESC NULLS LAST
      `);

      for (const row of oddsRows || []) {
        const norm = normalizePlayerName(row.player_norm);
        const line = toNumber(row.line, NaN);
        if (!norm || !Number.isFinite(line as number)) continue;
        lineByPlayerNorm.set(norm, line as number);
      }
    } catch (err) {
      console.warn("[team-players] odds lookup fallback:", (err as any)?.message || err);
    }
  }

  const injuryByNameTeam = new Map<string, any>();
  try {
    const injuryRows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT DISTINCT ON (player_name, team_abbreviation)
        player_name,
        UPPER(team_abbreviation::text) AS team_abbreviation,
        status
      FROM public.nba_injuries
      WHERE UPPER(team_abbreviation::text) IN (${Prisma.join(cleanTeams)})
      ORDER BY player_name, team_abbreviation, created_at DESC NULLS LAST
    `);

    for (const row of injuryRows || []) {
      const key = `${normalizePlayerName(row.player_name)}|${normalizeTeamAbbr(row.team_abbreviation)}`;
      injuryByNameTeam.set(key, row);
    }
  } catch (err) {
    console.warn("[team-players] injuries lookup fallback:", (err as any)?.message || err);
  }

  const players = (rosterRows || []).map((p) => {
    const id = Number(p.player_id);
    const fullName = String(p.player_name || `Jugador ${id}`);
    const team = normalizeTeamAbbr(p.team_abbreviation);
    const norm = normalizePlayerName(fullName);
    const line = lineByPlayerNorm.get(norm) ?? null;
    const logs = logsByPlayer.get(id) || [];
    const hits = line === null ? null : logs.filter((log) => getStatValue(log, stat) >= line).length;
    const hitRate = line === null || logs.length === 0 || hits === null
      ? null
      : Math.round((hits / logs.length) * 100);
    const injury = injuryByNameTeam.get(`${norm}|${team}`);

    return {
      id,
      full_name: fullName,
      team,
      team_abbreviation: team,
      injury_status: injury?.status ?? null,
      current_line: line,
      current_prop: propType,
      hit_rate: hitRate,
    };
  });

  return jsonSafe(players).sort((a: any, b: any) => {
    const ta = String(a.team_abbreviation || "");
    const tb = String(b.team_abbreviation || "");
    if (ta !== tb) return ta.localeCompare(tb);
    return String(a.full_name || "").localeCompare(String(b.full_name || ""));
  });
}

function cachedResponse(payload: any, cacheState: string) {
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": `public, max-age=${HTTP_MAX_AGE}, s-maxage=${HTTP_S_MAXAGE}, stale-while-revalidate=${HTTP_STALE}`,
      "X-Team-Players-Cache": cacheState,
    },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const team = String(searchParams.get("team") || "").trim().toUpperCase();
    const teamsParam = String(searchParams.get("teams") || "").trim();
    const stat = String(searchParams.get("stat") || "pts").trim().toLowerCase();
    const book = String(searchParams.get("book") || "stake").trim().toLowerCase();

    const teams = teamsParam
      ? teamsParam.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean)
      : team
        ? [team]
        : [];

    if (teams.length === 0) {
      return cachedResponse({ ok: true, count: 0, players: [] }, "EMPTY");
    }

    const key = JSON.stringify({ teams: Array.from(new Set(teams)).sort(), stat, book });
    const now = Date.now();
    const cached = TEAM_PLAYERS_CACHE.get(key);

    if (cached && cached.expiresAt > now) {
      return cachedResponse({ ok: true, count: cached.value.length, players: cached.value }, "HIT");
    }

    let promise = TEAM_PLAYERS_INFLIGHT.get(key);
    let cacheState = "MISS";

    if (!promise) {
      promise = loadTeamPlayersFast(teams, stat, book).finally(() => {
        TEAM_PLAYERS_INFLIGHT.delete(key);
      });
      TEAM_PLAYERS_INFLIGHT.set(key, promise);
    } else {
      cacheState = "DEDUPED";
    }

    const players = await promise;
    TEAM_PLAYERS_CACHE.set(key, { expiresAt: now + CACHE_TTL_MS, value: players });

    return cachedResponse({ ok: true, count: players.length, players }, cacheState);
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Error cargando compañeros", players: [] },
      { status: 500 },
    );
  }
}
