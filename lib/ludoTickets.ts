import 'server-only';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export type TicketLeg = {
  row_uid: string; player_id: number; player_name: string; source_team: string;
  prop_type: string; side: string; line: number; price: number; period: string;
  L10_hits: number; L10_valid: number; L20_hits: number; L20_valid: number;
  season_hits: number; season_valid: number; reference_season: string;
  season_transition?: boolean; current_season_n?: number; current_season_valid?: number;
  minutes_L10: number; history_through: string; quote_captured_at: string;
  fga_L10?: number | null; fg_pct_L10?: number | null;
};
export type Ticket = {
  version_id: string; generation_seq: number; generated_at: string; slot_key: string;
  event_date: string; game_key: string; book: string; kind: string; revision: number;
  proposal: {
    matchup: string; start_utc: string; freeze_at: string; status: string; reason?: string | null;
    option_rank?: number;
    nba_game_id?: string | null; odds_product_reference: number | null;
    actual_bookmaker_odds: number | null; joint_probability: null; picks: TicketLeg[];
    eligible_selections: number; exclusion_counts: Record<string, number>; notice: string;
    context?: { injury_context_available: boolean; injury_snapshot_date: string | null };
  };
  result: { status: string; reason?: string | null; nba_game_id?: string;
    remaining_odds_product_reference?: number;
    legs: { row_uid: string; status: string; actual: number | null; reason?: string | null }[];
  };
};

export function argentinaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function validTicketDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export type TicketFailureCode = 'TICKETS_NOT_INSTALLED' | 'TICKETS_PERMISSION' |
  'TICKETS_UNAVAILABLE' | 'TICKETS_INVALID_DATA' | 'TICKETS_INVALID_FILTER';

export class TicketReadError extends Error {
  constructor(public readonly code: TicketFailureCode) { super('Tickets no disponibles en este momento.'); }
}

export function ticketFailureCode(error: unknown): TicketFailureCode {
  if (error instanceof TicketReadError) return error.code;
  const e = error as { code?: string; meta?: { code?: string } } | null;
  if (e?.code === 'P2021' || e?.meta?.code === '42P01') return 'TICKETS_NOT_INSTALLED';
  if (e?.meta?.code === '42501') return 'TICKETS_PERMISSION';
  return 'TICKETS_UNAVAILABLE';
}

type RawTicket = Omit<Ticket, 'generation_seq' | 'revision' | 'generated_at'> & {
  generation_seq: string; revision: string; generated_at: Date | string;
};

export async function getDefaultTicketDate(today = argentinaToday()): Promise<string> {
  if (!validTicketDate(today)) return argentinaToday();
  try {
    const rows = await prisma.$queryRaw<{ event_date: string | null }[]>(Prisma.sql`
      SELECT min(event_date)::text AS event_date FROM public.ludo_ticket_publications
      WHERE event_date BETWEEN ${today}::date AND (${today}::date + 3)
    `);
    return rows[0]?.event_date || today;
  } catch { return today; }
}

export async function getTickets(date: string, book?: string, history = false): Promise<Ticket[]> {
  if (!validTicketDate(date) || (book && !['stake','betano','bet365'].includes(book))) {
    throw new TicketReadError('TICKETS_INVALID_FILTER');
  }
  const filters = Prisma.sql`event_date = ${date}::date ${book ? Prisma.sql`AND book = ${book}` : Prisma.empty}`;
  const source = history
    ? Prisma.sql`SELECT * FROM public.ludo_ticket_publications WHERE ${filters}`
    : Prisma.sql`SELECT DISTINCT ON (slot_key) * FROM public.ludo_ticket_publications
        WHERE ${filters} ORDER BY slot_key, generation_seq DESC`;
  try {
    // Usa DATABASE_URL, igual que estadísticas y autenticación. Sin otra clave REST.
    const rows = await prisma.$queryRaw<RawTicket[]>(Prisma.sql`
      SELECT p.version_id, p.generation_seq::text AS generation_seq, p.generated_at,
        p.slot_key, p.event_date::text AS event_date, p.game_key, p.book, p.kind,
        p.revision::text AS revision, p.proposal, p.result
      FROM (${source}) p ORDER BY p.generation_seq DESC LIMIT ${history ? 500 : 200}
    `);
    return rows.map((row) => {
      const sequence = Number(row.generation_seq); const revision = Number(row.revision);
      const generated = row.generated_at instanceof Date ? row.generated_at : new Date(row.generated_at);
      if (!Number.isSafeInteger(sequence) || sequence < 1 || !Number.isSafeInteger(revision) || revision < 1 ||
          !Number.isFinite(generated.getTime()) || !row.proposal || !Array.isArray(row.proposal.picks) ||
          !row.result || !Array.isArray(row.result.legs)) throw new TicketReadError('TICKETS_INVALID_DATA');
      return { ...row, generation_seq: sequence, revision, generated_at: generated.toISOString() };
    });
  } catch (error) {
    const code = ticketFailureCode(error);
    console.error('TICKETS_READ_FAILED', code);
    throw new TicketReadError(code);
  }
}
