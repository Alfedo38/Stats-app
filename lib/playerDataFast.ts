import prisma from "@/lib/prisma";

function plainValue(value: any): any {
  if (value === null || value === undefined) return value;

  if (typeof value === "bigint") return Number(value);

  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    // Prisma Decimal / Decimal.js, incluso cuando viene minificado.
    if (
      Array.isArray((value as any).d) &&
      typeof (value as any).s !== "undefined" &&
      typeof (value as any).e !== "undefined" &&
      typeof value.toString === "function"
    ) {
      const n = Number(value.toString());
      return Number.isFinite(n) ? n : null;
    }

    if (typeof value.toNumber === "function") {
      const n = value.toNumber();
      return Number.isFinite(n) ? n : null;
    }

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
      if (typeof v === "function") continue;
      out[k] = plainValue(v);
    }
    return out;
  }

  return value;
}

function toPlainRows(rows: any[]) {
  return rows.map((row) => plainValue(row));
}

function normalizeGameIdKey(value: any) {
  if (value === null || value === undefined || value === "") return "";
  const raw = String(value).trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return digits.replace(/^0+/, "") || "0";
}

function normalizeSplitPrefix(row: any): "q1" | "h1" | "h2" | null {
  const raw = String(
    row?.split_code ??
      row?.split ??
      row?.period ??
      row?.period_code ??
      row?.scope ??
      row?.period_type ??
      ""
  ).toUpperCase();

  if (raw === "Q1" || raw === "1" || raw === "P1" || raw.includes("1Q")) return "q1";
  if (raw === "H1" || raw === "FIRST_HALF" || raw === "1H" || raw.includes("FIRST")) return "h1";
  if (raw === "H2" || raw === "H2_REG" || raw === "SECOND_HALF" || raw === "2H" || raw.includes("SECOND")) return "h2";

  return null;
}

function num(value: any) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function first(...values: any[]) {
  return values.find((v) => v !== null && v !== undefined && v !== "");
}

function addSplitToAccumulator(acc: any, split: any, prefix: "q1" | "h1" | "h2") {
  acc[`${prefix}_min`] = first(split.min, split.minutes, split.min_text);
  acc[`${prefix}_minutes`] = acc[`${prefix}_min`];

  const fields = [
    "pts",
    "reb",
    "ast",
    "oreb",
    "dreb",
    "stl",
    "blk",
    "tov",
    "pf",
    "fgm",
    "fga",
    "fg3m",
    "fg3a",
    "ftm",
    "fta",
  ];

  for (const f of fields) {
    acc[`${prefix}_${f}`] = num(split?.[f]);
  }

  acc[`${prefix}_to`] = acc[`${prefix}_tov`];
  acc[`${prefix}_3ptm`] = acc[`${prefix}_fg3m`];
  acc[`${prefix}_3pta`] = acc[`${prefix}_fg3a`];

  acc[`${prefix}_pr`] = num(split.pr ?? acc[`${prefix}_pts`] + acc[`${prefix}_reb`]);
  acc[`${prefix}_pa`] = num(split.pa ?? acc[`${prefix}_pts`] + acc[`${prefix}_ast`]);
  acc[`${prefix}_ra`] = num(split.ra ?? acc[`${prefix}_reb`] + acc[`${prefix}_ast`]);
  acc[`${prefix}_pra`] = num(
    split.pra ?? acc[`${prefix}_pts`] + acc[`${prefix}_reb`] + acc[`${prefix}_ast`]
  );

  acc[`${prefix}_pts_reb`] = acc[`${prefix}_pr`];
  acc[`${prefix}_pts_ast`] = acc[`${prefix}_pa`];
  acc[`${prefix}_reb_ast`] = acc[`${prefix}_ra`];
  acc[`${prefix}_pts_reb_ast`] = acc[`${prefix}_pra`];
  acc[`${prefix}_stl_blk`] = num(split.stl_blk ?? acc[`${prefix}_stl`] + acc[`${prefix}_blk`]);
}

export async function getPlayerDataFast(playerId: string | number) {
  const id = Number(playerId);

  if (!Number.isFinite(id)) {
    return { player: null, stats: [] };
  }

  const [playerRaw, statsRaw, splitRowsRaw] = await Promise.all([
    prisma.players.findUnique({
      where: { id },
    }).catch(() => null),

    prisma.$queryRawUnsafe<any[]>(
      `
      SELECT *
      FROM public.player_page_game_fact_cache
      WHERE player_id = $1::bigint
      ORDER BY game_date DESC
      LIMIT 500
      `,
      id
    ),

    // Q1/H1/H2 vienen de una cache separada. Antes getPlayerDataFast no los cargaba,
    // por eso los botones 1ER CUARTO / 1RA MITAD / 2DA MITAD seguían mostrando full game.
    prisma.$queryRawUnsafe<any[]>(
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
      ORDER BY game_date DESC
      LIMIT 1500
      `,
      id
    ).catch((error) => {
      console.warn("[getPlayerDataFast] no se pudieron cargar period splits:", error?.message || error);
      return [];
    }),
  ]);

  const splitRows = toPlainRows(splitRowsRaw || []);
  const splitByGame = new Map<string, any>();

  for (const split of splitRows) {
    const prefix = normalizeSplitPrefix(split);
    if (!prefix) continue;

    const gameId = normalizeGameIdKey(split.game_id);
    if (!gameId) continue;

    const acc = splitByGame.get(gameId) || {};
    addSplitToAccumulator(acc, split, prefix);
    splitByGame.set(gameId, acc);
  }

  const stats = toPlainRows(statsRaw || []).map((row) => {
    const gameId = normalizeGameIdKey(row.game_id);
    const splitPayload = gameId ? splitByGame.get(gameId) || {} : {};

    return {
      ...row,
      ...splitPayload,
      has_q1_data: splitPayload.q1_pts !== undefined,
      has_h1_data: splitPayload.h1_pts !== undefined,
      has_h2_data: splitPayload.h2_pts !== undefined,
    };
  });

  const player = plainValue(playerRaw);

  if (!player && stats.length === 0) {
    return { player: null, stats: [] };
  }

  const firstRow = stats[0] || {};
  const fallbackName = firstRow.player_name || "Jugador";

  const safePlayer = player || {
    id,
    full_name: fallbackName,
    first_name: String(fallbackName).split(" ")[0],
    last_name: String(fallbackName).split(" ").slice(1).join(" "),
    team_abbreviation: firstRow.team_abbreviation || null,
    position: firstRow.position || firstRow.position_group || null,
  };

  return {
    player: plainValue(safePlayer),
    stats,
  };
}
