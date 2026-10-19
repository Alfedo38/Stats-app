import 'server-only';
import { createClient } from '@supabase/supabase-js';

export type TicketLeg = {
  row_uid: string; player_id: number; player_name: string; source_team: string;
  prop_type: string; side: string; line: number; price: number; period: string;
  L10_hits: number; L10_valid: number; L20_hits: number; L20_valid: number;
  season_hits: number; season_valid: number; reference_season: string;
  minutes_L10: number; history_through: string; quote_captured_at: string;
  fga_L10?: number | null; fg_pct_L10?: number | null;
};
export type Ticket = {
  version_id: string; generation_seq: number; generated_at: string; slot_key: string;
  event_date: string; book: string; kind: string; revision: number;
  proposal: {
    matchup: string; start_utc: string; freeze_at: string; status: string; reason?: string | null;
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

export async function getTickets(date: string, book?: string, history = false): Promise<Ticket[]> {
  if (!validTicketDate(date)) throw new Error('Fecha inválida');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Tickets no configurados');
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let query = supabase.from(history ? 'ludo_ticket_publications' : 'ludo_ticket_current')
    .select('version_id,generation_seq,generated_at,slot_key,event_date,book,kind,revision,proposal,result')
    .eq('event_date', date).order('generation_seq', { ascending: false }).limit(history ? 500 : 200);
  if (book) query = query.eq('book', book);
  const { data, error } = await query;
  if (error) throw new Error('No se pudo consultar tickets');
  return (data ?? []) as Ticket[];
}
