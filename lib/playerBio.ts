import prisma from "@/lib/prisma";

function normalizeDate(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value);
  const m = raw.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function calcAge(date: string | null) {
  if (!date) return null;
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 80 ? age : null;
}

function clean(value: any) {
  if (value === null || value === undefined || value === "") return null;
  const txt = String(value).trim();
  if (!txt || txt.toLowerCase() === "null" || txt.toLowerCase() === "nan") return null;
  return txt;
}

function normalizeName(value: any): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function formatHeight(row: any) {
  if (!row) return null;
  const direct = clean(row.height) || clean(row.player_height);
  if (direct) {
    const numeric = Number(direct);
    if (Number.isFinite(numeric) && numeric > 100) return `${Math.round(numeric)} cm`;
    return direct;
  }

  const inchesTotal = Number(row.player_height_inches ?? row.height_inches);
  if (Number.isFinite(inchesTotal) && inchesTotal > 0) {
    const feet = Math.floor(inchesTotal / 12);
    const inches = Math.round(inchesTotal % 12);
    return `${feet}'${inches}\"`;
  }

  return null;
}

function formatWeight(row: any) {
  if (!row) return null;
  const direct = clean(row.weight) || clean(row.player_weight);
  if (direct) return /kg|lb|lbs/i.test(direct) ? direct : `${direct} lb`;
  return null;
}

async function queryBioView(playerId: string | number | null, playerName: string | null) {
  async function run(whereSql: string, params: any[]) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT *
      FROM nba_api_data.v_player_bio_unified
      WHERE ${whereSql}
      ORDER BY rosterstatus = 'Active' DESC NULLS LAST,
               to_year DESC NULLS LAST,
               season_exp DESC NULLS LAST
      LIMIT 1
      `,
      ...params
    );
    return rows?.[0] || null;
  }

  const cleanName = clean(playerName);
  if (cleanName) {
    const exact = await run(`player_name ILIKE $1`, [cleanName]);
    if (exact) return exact;

    const tokens = normalizeName(cleanName).split(/\s+/).filter((t) => t.length >= 2);
    const first = tokens[0];
    const last = tokens.length > 1 ? tokens[tokens.length - 1] : null;
    if (first && last && first !== last) {
      const tokenMatch = await run(`lower(player_name) LIKE $1 AND lower(player_name) LIKE $2`, [`%${first}%`, `%${last}%`]);
      if (tokenMatch) return tokenMatch;
    }
  }

  if (playerId) {
    const byId = await run(`player_id::text = $1::text`, [String(playerId)]);
    if (byId) return byId;
  }

  return null;
}

async function queryBioFallback(playerId: string | number | null, playerName: string | null) {
  const cleanName = clean(playerName);
  const tokens = normalizeName(cleanName).split(/\s+/).filter((t) => t.length >= 2);
  const first = tokens[0] || "";
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : "";

  const baseSelect = `
    SELECT DISTINCT ON (COALESCE(pb.person_id, bs.player_id))
      COALESCE(pb.person_id, bs.player_id) AS player_id,
      COALESCE(NULLIF(pb.display_first_last, ''), NULLIF(bs.player_name, ''), TRIM(CONCAT(pb.first_name, ' ', pb.last_name))) AS player_name,
      pb.first_name,
      pb.last_name,
      COALESCE(NULLIF(pb.team_abbreviation, ''), NULLIF(bs.team_abbreviation, '')) AS team_abbreviation,
      pb.team_name,
      pb.team_city,
      pb.team_id,
      COALESCE(NULLIF(pb.position, ''), NULL) AS position,
      NULLIF(pb.jersey, '') AS jersey,
      COALESCE(NULLIF(pb.height, ''), NULLIF(bs.player_height, '')) AS height,
      COALESCE(NULLIF(pb.weight, ''), bs.player_weight::text) AS weight,
      bs.player_height_inches,
      pb.birthdate,
      bs.age,
      COALESCE(NULLIF(pb.country, ''), NULLIF(bs.country, '')) AS country,
      COALESCE(NULLIF(pb.school, ''), NULLIF(bs.college, ''), NULLIF(pb.last_affiliation, '')) AS college,
      COALESCE(NULLIF(pb.draft_year, ''), NULLIF(bs.draft_year, '')) AS draft_year,
      COALESCE(NULLIF(pb.draft_round, ''), NULLIF(bs.draft_round, '')) AS draft_round,
      COALESCE(NULLIF(pb.draft_number, ''), NULLIF(bs.draft_number, '')) AS draft_number,
      pb.season_exp,
      pb.from_year,
      pb.to_year,
      pb.rosterstatus,
      pb.greatest_75_flag,
      CASE
        WHEN COALESCE(pb.person_id, bs.player_id) IS NOT NULL
        THEN 'https://cdn.nba.com/headshots/nba/latest/1040x760/' || COALESCE(pb.person_id, bs.player_id)::text || '.png'
        ELSE NULL
      END AS headshot_url
    FROM nba_historical.player_bio pb
    FULL OUTER JOIN nba_historical.player_biostats bs
      ON bs.player_id = pb.person_id
  `;

  async function run(whereSql: string, params: any[]) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `${baseSelect}
       WHERE ${whereSql}
       ORDER BY COALESCE(pb.person_id, bs.player_id), COALESCE(bs.gp, 0) DESC NULLS LAST, pb.to_year DESC NULLS LAST
       LIMIT 1`,
      ...params
    );
    return rows?.[0] || null;
  }

  if (cleanName) {
    const exact = await run(`COALESCE(pb.display_first_last, bs.player_name) ILIKE $1`, [cleanName]);
    if (exact) return exact;
    if (first && last && first !== last) {
      const tokenMatch = await run(
        `lower(COALESCE(pb.display_first_last, bs.player_name, '')) LIKE $1 AND lower(COALESCE(pb.display_first_last, bs.player_name, '')) LIKE $2`,
        [`%${first}%`, `%${last}%`]
      );
      if (tokenMatch) return tokenMatch;
    }
  }

  if (playerId) {
    const byId = await run(`COALESCE(pb.person_id, bs.player_id)::text = $1::text`, [String(playerId)]);
    if (byId) return byId;
  }

  return null;
}

async function getHistoricalPlayerRow(playerId: string | number | null, playerName: string | null) {
  try {
    return await queryBioView(playerId, playerName);
  } catch (error) {
    try {
      return await queryBioFallback(playerId, playerName);
    } catch (fallbackError) {
      console.warn("No se pudo leer bio histórica del jugador", fallbackError);
      return null;
    }
  }
}

export async function getPlayerBioDetails(playerId: string | number | null, playerName: string | null) {
  const local = playerId
    ? await prisma.players.findUnique({ where: { id: Number(playerId) } }).catch(() => null)
    : null;

  const localByName = !local && playerName
    ? await prisma.players.findFirst({ where: { full_name: { equals: playerName, mode: "insensitive" } } }).catch(() => null)
    : null;

  const hist = await getHistoricalPlayerRow(playerId, playerName);
  const birthdate = normalizeDate(hist?.birthdate);
  const age = hist?.age !== null && hist?.age !== undefined && Number.isFinite(Number(hist.age))
    ? Number(hist.age)
    : calcAge(birthdate);

  return {
    jerseyNumber: clean(local?.jersey_number) || clean(localByName?.jersey_number) || clean(hist?.jersey) || clean(hist?.jersey_number),
    position: clean(local?.position) || clean(localByName?.position) || clean(hist?.position),
    height: formatHeight(hist),
    weight: formatWeight(hist),
    birthdate,
    age,
    country: clean(hist?.country),
    school: clean(hist?.college) || clean(hist?.school),
    imageUrl: clean(local?.image_url) || clean(localByName?.image_url) || clean(hist?.headshot_url),
  };
}
