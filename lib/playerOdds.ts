import prisma from './prisma';

export type StakePlayerOdd = {
  player_name: string;
  prop_type: string;
  line: number | null;
  matchup: string | null;
  over_price: number | null;
  under_price: number | null;
  updated_at: string | null;
  book?: string | null;
  source?: 'universal' | 'legacy';
};

function normalizeName(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`´]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toNumberOrNull(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toTextOrNull(value: any): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function oddSortValue(odd: StakePlayerOdd) {
  const prop = String(odd.prop_type || '');
  const line = Number(odd.line ?? 9999);
  return `${prop.padEnd(8, ' ')}_${line.toString().padStart(8, '0')}`;
}

async function getUniversalStakeOdds(target: string): Promise<StakePlayerOdd[]> {
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        jugador,
        player_norm,
        stat_key,
        side,
        model_line,
        threshold,
        odds_decimal,
        partido,
        game_norm,
        scraped_at_utc
      FROM public.latest_player_prop_odds
      WHERE book = 'stake'
        AND player_norm = ${target}
      ORDER BY stat_key ASC, model_line ASC, side ASC
    `;

    if (!Array.isArray(rows) || rows.length === 0) return [];

    const grouped = new Map<string, StakePlayerOdd>();

    for (const row of rows) {
      const propType = String(row.stat_key || '').toUpperCase();
      const line = toNumberOrNull(row.model_line ?? row.threshold);
      if (!propType || line === null) continue;

      const key = `${propType}|${line}`;
      const existing = grouped.get(key) || {
        player_name: row.jugador || target,
        prop_type: propType,
        line,
        matchup: row.partido || row.game_norm || null,
        over_price: null,
        under_price: null,
        updated_at: toTextOrNull(row.scraped_at_utc),
        book: 'stake',
        source: 'universal' as const,
      };

      const side = String(row.side || '').toLowerCase();
      const odds = toNumberOrNull(row.odds_decimal);

      if (side === 'over') existing.over_price = odds;
      if (side === 'under') existing.under_price = odds;

      grouped.set(key, existing);
    }

    return Array.from(grouped.values()).sort((a, b) => oddSortValue(a).localeCompare(oddSortValue(b)));
  } catch (error) {
    console.warn('getUniversalStakeOdds fallback:', error);
    return [];
  }
}

async function getLegacyStakeOdds(playerName: string): Promise<StakePlayerOdd[]> {
  const target = normalizeName(playerName);
  if (!target) return [];

  // La tabla legacy es chica. Traer y normalizar en memoria evita problemas con apóstrofes:
  // De'Aaron, De’Aaron, de aaron, etc.
  const rows = await prisma.player_odds.findMany({
    orderBy: [{ prop_type: 'asc' }],
  });

  return rows
    .filter((row: any) => normalizeName(row.player_name) === target)
    .map((row: any) => ({
      player_name: row.player_name,
      prop_type: row.prop_type,
      line: toNumberOrNull(row.line),
      matchup: row.matchup ?? null,
      over_price: toNumberOrNull(row.over_price),
      under_price: toNumberOrNull(row.under_price),
      updated_at: row.updated_at ?? null,
      book: 'stake',
      source: 'legacy' as const,
    }))
    .sort((a, b) => oddSortValue(a).localeCompare(oddSortValue(b)));
}

export async function getPlayerStakeOdds(playerName: string): Promise<StakePlayerOdd[]> {
  const target = normalizeName(playerName);
  if (!target) return [];

  const universal = await getUniversalStakeOdds(target);
  if (universal.length > 0) return universal;

  return getLegacyStakeOdds(playerName);
}