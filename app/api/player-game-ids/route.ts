import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseCsv(raw: string | null): string[] {
  if (!raw) return [];
  return Array.from(new Set(raw.split(",").map((v) => v.trim()).filter(Boolean)));
}

function parseIds(raw: string | null): number[] {
  return parseCsv(raw)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function normalizeName(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`´]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeTeam(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase();
}

function namesCompatible(dbName: string, refName: string): boolean {
  const a = normalizeName(dbName);
  const b = normalizeName(refName);
  if (!a || !b) return false;
  if (a === b) return true;

  // Fallback para nombres ESPN abreviados: "S. Gilgeous-Alexander" vs "Shai Gilgeous-Alexander".
  const at = a.split(" ").filter(Boolean);
  const bt = b.split(" ").filter(Boolean);
  if (at.length < 2 || bt.length < 2) return false;

  const sameLast = at[at.length - 1] === bt[bt.length - 1];
  const sameFirstInitial = at[0]?.[0] && bt[0]?.[0] && at[0][0] === bt[0][0];
  return Boolean(sameLast && sameFirstInitial);
}

function parseRef(ref: string): { raw: string; team: string; name: string } | null {
  const decoded = decodeURIComponent(ref);
  const [team, ...nameParts] = decoded.split("|");
  const name = nameParts.join("|").trim();
  const cleanTeam = normalizeTeam(team);
  if (!cleanTeam || !name) return null;
  return { raw: ref, team: cleanTeam, name };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ids = parseIds(url.searchParams.get("ids"));
    const refs = parseCsv(url.searchParams.get("refs"));

    const players: Record<string, string[]> = {};

    // Modo legacy: ids numéricos directos de nba_api/player_game_logs.
    if (ids.length > 0) {
      const rows = await prisma.player_game_logs.findMany({
        where: { player_id: { in: ids } },
        select: { player_id: true, game_id: true },
        distinct: ["player_id", "game_id"],
      });

      for (const row of rows) {
        if (row.player_id == null || row.game_id == null) continue;
        const key = String(row.player_id);
        if (!players[key]) players[key] = [];
        players[key].push(String(row.game_id));
      }
    }

    // Modo robusto: referencias codificadas "TEAM|Player Name".
    const parsedRefs = refs.map(parseRef).filter((r): r is NonNullable<ReturnType<typeof parseRef>> => Boolean(r));
    if (parsedRefs.length > 0) {
      const teams = Array.from(new Set(parsedRefs.map((r) => r.team)));
      const rows = await prisma.player_game_logs.findMany({
        where: { team_abbreviation: { in: teams, mode: "insensitive" } },
        select: { player_name: true, team_abbreviation: true, game_id: true },
        orderBy: { game_date: "desc" },
      });

      for (const ref of parsedRefs) {
        const gameIds = new Set<string>();
        for (const row of rows) {
          if (!row.game_id) continue;
          if (normalizeTeam(row.team_abbreviation) !== ref.team) continue;
          if (!namesCompatible(row.player_name || "", ref.name)) continue;
          gameIds.add(String(row.game_id));
        }
        players[ref.raw] = Array.from(gameIds);
      }
    }

    return NextResponse.json({ players });
  } catch (err: any) {
    console.error("[/api/player-game-ids] Error:", err);
    return NextResponse.json(
      { players: {}, error: "Error al cargar game_ids", detail: err?.message },
      { status: 500 }
    );
  }
}
