import prisma from "@/lib/prisma";

function plainValue(value: any): any {
  if (value === null || value === undefined) return value;

  if (typeof value === "bigint") return Number(value);

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    // Prisma Decimal
    if (
      typeof value.toNumber === "function" &&
      typeof value.toString === "function" &&
      value.constructor?.name === "Decimal"
    ) {
      return value.toNumber();
    }

    // Otros objetos Decimal-like
    if (
      typeof value.toString === "function" &&
      value.constructor?.name?.toLowerCase?.().includes("decimal")
    ) {
      const n = Number(value.toString());
      return Number.isFinite(n) ? n : value.toString();
    }

    if (Array.isArray(value)) return value.map(plainValue);

    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = plainValue(v);
    }
    return out;
  }

  return value;
}

function toPlainRows(rows: any[]) {
  return rows.map((row) => plainValue(row));
}

export async function getPlayerDataFast(playerId: string | number) {
  const id = Number(playerId);

  if (!Number.isFinite(id)) {
    return { player: null, stats: [] };
  }

  const [playerRaw, statsRaw] = await Promise.all([
    prisma.players.findUnique({
      where: { id },
    }).catch(() => null),

    prisma.$queryRawUnsafe<any[]>(`
      SELECT
        *
      FROM public.player_page_game_fact_cache
      WHERE player_id = $1
      ORDER BY game_date DESC
      LIMIT 500
    `, id),
  ]);

  const player = plainValue(playerRaw);
  const stats = toPlainRows(statsRaw || []);

  if (!player && stats.length === 0) {
    return { player: null, stats: [] };
  }

  const first = stats[0] || {};
  const fallbackName = first.player_name || "Jugador";

  const safePlayer = player || {
    id,
    full_name: fallbackName,
    first_name: String(fallbackName).split(" ")[0],
    last_name: String(fallbackName).split(" ").slice(1).join(" "),
    team_abbreviation: first.team_abbreviation || null,
    position: first.position || first.position_group || null,
  };

  return {
    player: plainValue(safePlayer),
    stats,
  };
}
