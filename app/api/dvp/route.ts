import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type TeamDvpRow = {
  team: string;
  position: string;
  pts_allowed: number | null;
  reb_allowed: number | null;
  ast_allowed: number | null;
  threes_allow: number | null;
  updated_at: string | null;
};

type LeagueAvgRow = {
  pts_allowed: number | null;
  reb_allowed: number | null;
  ast_allowed: number | null;
  threes_allow: number | null;
};

function cleanTeam(value: string | null): string {
  return String(value || "").trim().toUpperCase();
}

function normalizePositionForDvp(position: string | null): string {
  const raw = String(position || "").trim().toUpperCase();

  if (!raw) return "G";

  if (["G", "PG", "SG", "POINT GUARD", "SHOOTING GUARD", "GUARD"].includes(raw)) return "G";
  if (["F", "SF", "PF", "SMALL FORWARD", "POWER FORWARD", "FORWARD"].includes(raw)) return "F";
  if (["C", "CENTER", "CENTRE"].includes(raw)) return "C";
  if (["G-F", "F-G", "GF", "FG", "GUARD-FORWARD", "FORWARD-GUARD"].includes(raw)) return "G-F";
  if (["F-C", "C-F", "FC", "CF", "FORWARD-CENTER", "CENTER-FORWARD"].includes(raw)) return "F-C";

  if (raw.includes("GUARD") || raw.includes("PG") || raw.includes("SG")) return "G";
  if (raw.includes("CENTER") || raw === "C") return "C";
  if (raw.includes("FORWARD") || raw.includes("SF") || raw.includes("PF")) return "F";

  return raw;
}

function candidateGroups(primary: string): string[] {
  if (primary === "G-F") return ["G-F", "G", "F"];
  if (primary === "F-C") return ["F-C", "C", "F"];
  if (primary === "G") return ["G", "G-F"];
  if (primary === "F") return ["F", "G-F", "F-C"];
  if (primary === "C") return ["C", "F-C"];
  return [primary, "G", "F", "C"];
}

function groupLabel(group: string): string {
  switch (group) {
    case "G": return "Guards";
    case "F": return "Forwards";
    case "C": return "Centers";
    case "G-F": return "Wings";
    case "F-C": return "Bigs";
    default: return group;
  }
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function metric(label: string, key: keyof TeamDvpRow, row: TeamDvpRow, avg: LeagueAvgRow) {
  const value = toNumber(row[key]);
  const league = toNumber(avg[key as keyof LeagueAvgRow]);
  const diff = value !== null && league !== null ? value - league : null;

  return {
    key,
    label,
    value,
    leagueAvg: league,
    diff,
    favorable: diff !== null ? diff > 0 : null,
  };
}

async function findDvpRow(team: string, groups: string[]) {
  const rows = await prisma.$queryRaw<TeamDvpRow[]>`
    SELECT
      team,
      position,
      pts_allowed,
      reb_allowed,
      ast_allowed,
      threes_allow,
      updated_at
    FROM public.team_dvp
    WHERE UPPER(team) = ${team}
      AND position = ANY(${groups}::text[])
    ORDER BY array_position(${groups}::text[], position)
    LIMIT 1
  `;

  return rows[0] || null;
}

async function getLeagueAvg(positionGroup: string) {
  const avgRows = await prisma.$queryRaw<LeagueAvgRow[]>`
    SELECT
      AVG(pts_allowed)::float8 AS pts_allowed,
      AVG(reb_allowed)::float8 AS reb_allowed,
      AVG(ast_allowed)::float8 AS ast_allowed,
      AVG(threes_allow)::float8 AS threes_allow
    FROM public.team_dvp
    WHERE position = ${positionGroup}
  `;

  return avgRows[0] || {
    pts_allowed: null,
    reb_allowed: null,
    ast_allowed: null,
    threes_allow: null,
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const team = cleanTeam(searchParams.get("team"));
    const rawPosition = searchParams.get("position") || "G";
    const positionGroup = normalizePositionForDvp(rawPosition);
    const groups = candidateGroups(positionGroup);

    if (!team) {
      return NextResponse.json({ ok: false, error: "missing_team" }, { status: 400 });
    }

    const row = await findDvpRow(team, groups);

    if (!row) {
      return NextResponse.json({
        ok: true,
        team,
        requestedPosition: rawPosition,
        positionGroup,
        resolvedPositionGroup: positionGroup,
        positionLabel: groupLabel(positionGroup),
        found: false,
        message: `Sin datos para ${team} vs ${groupLabel(positionGroup)}`,
        metrics: [],
      });
    }

    const resolvedPositionGroup = row.position;
    const leagueAvg = await getLeagueAvg(resolvedPositionGroup);

    return NextResponse.json({
      ok: true,
      team,
      requestedPosition: rawPosition,
      positionGroup,
      resolvedPositionGroup,
      positionLabel: groupLabel(resolvedPositionGroup),
      found: true,
      updatedAt: row.updated_at,
      metrics: [
        metric("PTS", "pts_allowed", row, leagueAvg),
        metric("REB", "reb_allowed", row, leagueAvg),
        metric("AST", "ast_allowed", row, leagueAvg),
        metric("3PM", "threes_allow", row, leagueAvg),
      ],
    });
  } catch (error: any) {
    console.error("/api/dvp error", error);
    return NextResponse.json(
      { ok: false, error: "dvp_query_failed", detail: error?.message || String(error) },
      { status: 500 },
    );
  }
}
