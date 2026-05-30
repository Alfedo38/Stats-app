import prisma from './prisma';
import { Prisma } from '@prisma/client';

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
  const book = String(odd.book || 'stake');
  const prop = String(odd.prop_type || '');
  const line = Number(odd.line ?? 9999);
  return `${prop.padEnd(8, ' ')}_${line.toString().padStart(8, '0')}_${book}`;
}

function normalizeBooks(books?: string[]) {
  return Array.from(new Set((books || []).map((b) => String(b).trim().toLowerCase()).filter(Boolean)));
}

async function getUniversalOdds(
  target: string,
  options: { books?: string[] } = {}
): Promise<StakePlayerOdd[]> {
  try {
    const books = normalizeBooks(options.books);

    const rows = books.length > 0
      ? await prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT
            book,
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
          WHERE lower(book) IN (${Prisma.join(books)})
            AND player_norm = ${target}
          ORDER BY stat_key ASC, COALESCE(model_line, threshold) ASC, book ASC, side ASC, scraped_at_utc DESC
        `)
      : await prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT
            book,
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
          WHERE player_norm = ${target}
          ORDER BY stat_key ASC, COALESCE(model_line, threshold) ASC, book ASC, side ASC, scraped_at_utc DESC
        `);

    if (!Array.isArray(rows) || rows.length === 0) return [];

    const grouped = new Map<string, StakePlayerOdd>();

    for (const row of rows) {
      const book = String(row.book || 'stake').toLowerCase();
      const propType = String(row.stat_key || '').toUpperCase();
      const line = toNumberOrNull(row.model_line ?? row.threshold);
      if (!propType || line === null) continue;

      const key = `${book}|${propType}|${line}`;
      const existing = grouped.get(key) || {
        player_name: row.jugador || target,
        prop_type: propType,
        line,
        matchup: row.partido || row.game_norm || null,
        over_price: null,
        under_price: null,
        updated_at: toTextOrNull(row.scraped_at_utc),
        book,
        source: 'universal' as const,
      };

      const side = String(row.side || '').toLowerCase();
      const odds = toNumberOrNull(row.odds_decimal);

      if (side === 'over') existing.over_price = odds;
      if (side === 'under') existing.under_price = odds;

      if (!existing.updated_at && row.scraped_at_utc) {
        existing.updated_at = toTextOrNull(row.scraped_at_utc);
      }

      grouped.set(key, existing);
    }

    return Array.from(grouped.values()).sort((a, b) => oddSortValue(a).localeCompare(oddSortValue(b)));
  } catch (error) {
    console.warn('getUniversalOdds fallback:', error);
    return [];
  }
}

async function getLegacyStakeOdds(playerName: string): Promise<StakePlayerOdd[]> {
  const target = normalizeName(playerName);
  if (!target) return [];

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

export async function getPlayerOddsMultiBook(
  playerName: string,
  options: { books?: string[] } = {}
): Promise<StakePlayerOdd[]> {
  const target = normalizeName(playerName);
  if (!target) return [];

  const universal = await getUniversalOdds(target, options);
  if (universal.length > 0) return universal;

  const books = normalizeBooks(options.books);
  if (books.length === 0 || books.includes('stake')) {
    return getLegacyStakeOdds(playerName);
  }

  return [];
}

export async function getPlayerStakeOdds(playerName: string): Promise<StakePlayerOdd[]> {
  return getPlayerOddsMultiBook(playerName, { books: ['stake'] });
}
