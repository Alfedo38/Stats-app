import prisma from "@/lib/prisma";

function normalizeDate(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value).trim();
  const m = raw.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function calcAgeFromBirthdate(date: string | null) {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  const monthDiff = now.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d)) age -= 1;
  return age >= 0 && age < 80 ? age : null;
}

function clean(value: any) {
  if (value === null || value === undefined || value === "") return null;
  const txt = String(value).trim();
  if (!txt || txt.toLowerCase() === "null" || txt.toLowerCase() === "nan" || txt === "—") return null;
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

function roundToInt(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value);
}

function parseHeightCm(row: any): number | null {
  if (!row) return null;

  const directCm = Number(row.height_cm ?? row.player_height_cm);
  if (Number.isFinite(directCm) && directCm > 120 && directCm < 260) return directCm;

  const directM = Number(row.height_m ?? row.player_height_m);
  if (Number.isFinite(directM) && directM > 1.2 && directM < 2.6) return directM * 100;

  const inchesTotal = Number(row.player_height_inches ?? row.height_inches);
  if (Number.isFinite(inchesTotal) && inchesTotal > 48 && inchesTotal < 100) return inchesTotal * 2.54;

  const raw = clean(row.height) || clean(row.player_height) || clean(row.height_original);
  if (!raw) return null;

  const lower = raw.toLowerCase();
  const numeric = Number(lower.replace(/[^0-9.]/g, ""));

  if (/cm|cent/i.test(lower) && Number.isFinite(numeric) && numeric > 120) return numeric;
  if (/m\b|metros?|meter/i.test(lower) && Number.isFinite(numeric) && numeric > 1.2 && numeric < 2.6) return numeric * 100;

  // NBA format: 6-8, 6'8", 6 ft 8 in.
  const nba = lower.match(/(\d+)\s*(?:-|\'|ft|feet)\s*(\d+)/i);
  if (nba) {
    const ft = Number(nba[1]);
    const inches = Number(nba[2]);
    if (Number.isFinite(ft) && Number.isFinite(inches) && ft >= 4 && ft <= 8) {
      return (ft * 12 + inches) * 2.54;
    }
  }

  // Plain inches, e.g. 80.
  if (Number.isFinite(numeric) && numeric > 48 && numeric < 100) return numeric * 2.54;

  // Plain centimeters, e.g. 203.
  if (Number.isFinite(numeric) && numeric > 120 && numeric < 260) return numeric;

  return null;
}

function parseWeightKg(row: any): number | null {
  if (!row) return null;

  const directKg = Number(row.weight_kg ?? row.player_weight_kg);
  if (Number.isFinite(directKg) && directKg > 45 && directKg < 220) return directKg;

  const raw = clean(row.weight) || clean(row.player_weight) || clean(row.weight_original);
  if (!raw) return null;

  const lower = raw.toLowerCase();
  const numeric = Number(lower.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric)) return null;

  if (/kg|kilo/i.test(lower)) return numeric;

  // NBA bio weights usually come as pounds even when unit is omitted.
  if (/lb|lbs|pound/i.test(lower) || numeric > 160) return numeric * 0.45359237;

  // If it is already in the plausible kg range, keep it.
  if (numeric > 45 && numeric < 160) return numeric;

  return null;
}

function formatHeight(row: any) {
  const cm = parseHeightCm(row);
  if (cm === null) return clean(row?.height_display) || clean(row?.height) || clean(row?.player_height);
  return `${(cm / 100).toFixed(2)} m`;
}

function formatWeight(row: any) {
  const kg = parseWeightKg(row);
  if (kg === null) return clean(row?.weight_display) || clean(row?.weight) || clean(row?.player_weight);
  return `${Math.round(kg)} kg`;
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
      ...params,
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
      const tokenMatch = await run(
        `lower(player_name) LIKE $1 AND lower(player_name) LIKE $2`,
        [`%${first}%`, `%${last}%`],
      );
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
      ...params,
    );
    return rows?.[0] || null;
  }

  if (cleanName) {
    const exact = await run(`COALESCE(pb.display_first_last, bs.player_name) ILIKE $1`, [cleanName]);
    if (exact) return exact;
    if (first && last && first !== last) {
      const tokenMatch = await run(
        `lower(COALESCE(pb.display_first_last, bs.player_name, '')) LIKE $1 AND lower(COALESCE(pb.display_first_last, bs.player_name, '')) LIKE $2`,
        [`%${first}%`, `%${last}%`],
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
  const calculatedAge = calcAgeFromBirthdate(birthdate);
  const fallbackAge = hist?.age !== null && hist?.age !== undefined && Number.isFinite(Number(hist.age))
    ? Number(hist.age)
    : null;

  return {
    jerseyNumber: clean(local?.jersey_number) || clean(localByName?.jersey_number) || clean(hist?.jersey) || clean(hist?.jersey_number),
    position: clean(local?.position) || clean(localByName?.position) || clean(hist?.position),
    height: formatHeight(hist),
    weight: formatWeight(hist),
    birthdate,
    // Always prefer current age from birthdate. Historical age can be stale by season.
    age: calculatedAge ?? fallbackAge,
    country: clean(hist?.country),
    school: clean(hist?.college) || clean(hist?.school),
    imageUrl: null,
  };
}
