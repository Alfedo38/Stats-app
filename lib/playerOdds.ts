import prisma from './prisma';
import { Prisma } from '@prisma/client';
import { canonicalOddsPlayerName, oddsPlayerNameCandidates, matchesOddsPlayer } from './oddsPlayerNames';
// BET365_NAME_ORDER_V1

import {groupUniversalQuotes,type PriceQuote} from './nbaOdds';
export type StakePlayerOdd=PriceQuote;

function normalizeName(value: string | null | undefined) {
  return canonicalOddsPlayerName(value);
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
    const nameCandidates = oddsPlayerNameCandidates(target);

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
            scraped_at_utc,
            COALESCE(to_jsonb(o)->>'period_scope',to_jsonb(o)->>'scope',to_jsonb(o)->>'market_scope',to_jsonb(o)->>'period') AS period_scope,
            COALESCE(to_jsonb(o)->>'event_date',to_jsonb(o)->>'game_date',to_jsonb(o)->>'start_time') AS event_date
          FROM public.latest_player_prop_odds_cache o
          WHERE lower(book) IN (${Prisma.join(books)})
            AND player_norm IN (${Prisma.join(nameCandidates)})
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
            scraped_at_utc,
            COALESCE(to_jsonb(o)->>'period_scope',to_jsonb(o)->>'scope',to_jsonb(o)->>'market_scope',to_jsonb(o)->>'period') AS period_scope,
            COALESCE(to_jsonb(o)->>'event_date',to_jsonb(o)->>'game_date',to_jsonb(o)->>'start_time') AS event_date
          FROM public.latest_player_prop_odds_cache o
          WHERE player_norm IN (${Prisma.join(nameCandidates)})
          ORDER BY stat_key ASC, COALESCE(model_line, threshold) ASC, book ASC, side ASC, scraped_at_utc DESC
        `);

    if (!Array.isArray(rows) || rows.length === 0) return [];

    return groupUniversalQuotes(rows.filter(row => matchesOddsPlayer(row.jugador, row.player_norm, target)));

  } catch (error) {
    console.warn('PLAYER_ODDS_UNIVERSAL_UNAVAILABLE');
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
      scope: 'FULL',
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
