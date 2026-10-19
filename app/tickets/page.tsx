import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, Ticket as TicketIcon } from 'lucide-react';
import { requirePageUser } from '@/lib/auth/server';
import { getDefaultTicketDate, getTickets, validTicketDate, type Ticket } from '@/lib/ludoTickets';
import RefreshTickets from './RefreshTickets';
import styles from './tickets.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tickets NBA | MoskProps' };
const LABELS: Record<string, string> = { PENDING: 'Pendiente', WIN: 'Ganado', LOSS: 'Perdido',
  VOID: 'Anulado', REVIEW: 'Revisión', NO_OPTION: 'Sin opción' };
const BOOKS: Record<string, string> = { stake: 'Stake', betano: 'Betano', bet365: 'bet365' };
const fmt = (v: number | null | undefined, digits = 2) => typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—';
const time = (v: string) => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires',
  hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(v));
const first = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v;
function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function TicketBlock({ ticket, archived }: { ticket: Ticket; archived: boolean }) {
  const p = ticket.proposal; const result = ticket.result;
  return <div className={`${styles.ticket} ${archived ? styles.archived : ''}`}>
    <div className={styles.ticketTop}>
      <div className={styles.target}>{ticket.kind === 'x2' ? '×2' : '×5'}{archived && <small>Anterior</small>}</div>
      <span className={styles.status} data-status={result.status}>{LABELS[result.status] || result.status}</span>
    </div>
    {p.status === 'NO_OPTION' ? <div className={styles.noOption}>Sin selección disponible</div> : <>
      <ul className={styles.legs}>{p.picks.map((leg) => {
        const outcome = result.legs.find((r) => r.row_uid === leg.row_uid);
        return <li key={leg.row_uid}>
          <div className={styles.legTitle}><Link href={`/players/${leg.player_id}`}>{leg.player_name}</Link><b>{fmt(leg.price)}</b></div>
          <div className={styles.selection}><span>{leg.side === 'under' ? 'Under' : 'Over'} {leg.line}</span> {leg.prop_type}{leg.period === 'Q1' ? ' · 1Q' : ''}</div>
          <div className={styles.frequencies}>
            <span>L10 <b>{leg.L10_hits}/{leg.L10_valid}</b></span>
            <span>L20 <b>{leg.L20_hits}/{leg.L20_valid}</b></span>
            <span>Temporada <b>{leg.season_hits}/{leg.season_valid}</b></span>
          </div>
          {outcome && <div className={styles.outcome} data-status={outcome.status}>
            {LABELS[outcome.status]}{outcome.actual != null ? ` · ${outcome.actual}` : ''}
          </div>}
          <details className={styles.details}><summary>Estadísticas</summary><dl>
            <div><dt>Minutos L10</dt><dd>{fmt(leg.minutes_L10, 1)}</dd></div>
            <div><dt>Temporada</dt><dd>{leg.reference_season}</dd></div>
            {leg.prop_type === 'FGM' && <>
              <div><dt>FGA L10</dt><dd>{fmt(leg.fga_L10, 1)}</dd></div>
              <div><dt>FG% L10</dt><dd>{leg.fg_pct_L10 == null ? '—' : `${fmt(leg.fg_pct_L10 * 100, 1)}%`}</dd></div>
            </>}
            <div><dt>Cuota capturada</dt><dd>{time(leg.quote_captured_at)}</dd></div>
          </dl></details>
        </li>;
      })}</ul>
      <div className={styles.ticketBottom}><span>Cuota estimada</span><strong>×{fmt(p.odds_product_reference, 3)}</strong></div>
      {result.legs.some((leg) => leg.status === 'VOID') && <div className={styles.adjusted}>Tras anulaciones <b>×{fmt(result.remaining_odds_product_reference, 3)}</b></div>}
    </>}
  </div>;
}

export default async function TicketsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageUser();
  const params = await searchParams;
  const requested = first(params.date);
  const date = requested && validTicketDate(requested) ? requested : await getDefaultTicketDate();
  const selectedBook = first(params.book) || '';
  const book = Object.keys(BOOKS).includes(selectedBook) ? selectedBook : '';
  const history = first(params.history) === '1';
  let tickets: Ticket[] = []; let failed = false;
  try { tickets = await getTickets(date, book || undefined, history); } catch { failed = true; }
  const latest = new Map<string, string>();
  for (const t of tickets) if (!latest.has(t.slot_key)) latest.set(t.slot_key, t.version_id);
  const groups = new Map<string, Ticket[]>();
  for (const t of tickets) {
    const group = groups.get(t.game_key) || []; group.push(t); groups.set(t.game_key, group);
  }
  const games = [...groups.values()].sort((a, b) => a[0].proposal.start_utc.localeCompare(b[0].proposal.start_utc));
  const current = tickets.filter((t) => latest.get(t.slot_key) === t.version_id);
  const total = current.filter((t) => t.proposal.status === 'PROPOSED').length;
  const href = (day: string) => `/tickets?date=${day}${book ? `&book=${book}` : ''}${history ? '&history=1' : ''}`;
  return <main className={styles.page}>
    <RefreshTickets />
    <header className={styles.header}>
      <div><div className={styles.eyebrow}><TicketIcon size={14} /> NBA</div><h1>Tickets</h1></div>
      {!failed && tickets.length > 0 && <div className={styles.summary}><b>{games.length}</b> partidos<span /> <b>{total}</b> tickets</div>}
    </header>
    <div className={styles.toolbar}>
      <div className={styles.dateNav}>
        <Link href={href(shiftDate(date, -1))} aria-label="Jornada anterior"><ChevronLeft size={19} /></Link>
        <span><CalendarDays size={15} />{new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}</span>
        <Link href={href(shiftDate(date, 1))} aria-label="Jornada siguiente"><ChevronRight size={19} /></Link>
      </div>
      <form className={styles.filters} action="/tickets">
        <label><span>Fecha</span><input name="date" type="date" defaultValue={date} required /></label>
        <label><span>Casa</span><select name="book" defaultValue={book}><option value="">Todas las casas</option>
          {Object.entries(BOOKS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className={styles.check}><input name="history" type="checkbox" value="1" defaultChecked={history} />Historial</label>
        <button type="submit">Ver</button>
      </form>
    </div>
    {failed ? <div className={styles.empty}><TicketIcon size={26} /><h2>Tickets no disponibles en este momento</h2></div> :
      games.length === 0 ? <div className={styles.empty}><TicketIcon size={26} /><h2>Sin tickets para esta jornada</h2></div> :
      <div className={styles.games}>{games.map((group) => {
        const sample = group[0];
        return <section key={sample.game_key} className={styles.game}>
          <div className={styles.gameHeading}><h2>{sample.proposal.matchup}</h2><time dateTime={sample.proposal.start_utc}>{time(sample.proposal.start_utc)}</time></div>
          <div className={styles.bookGrid}>{Object.entries(BOOKS).map(([id, label]) => {
            const rows = group.filter((t) => t.book === id).sort((a, b) => a.kind.localeCompare(b.kind) || b.generation_seq - a.generation_seq);
            if (!rows.length) return null;
            return <article key={id} className={styles.bookCard}><header className={styles.bookHeading} data-book={id}><i />{label}</header>
              {rows.map((t) => <TicketBlock key={t.version_id} ticket={t} archived={latest.get(t.slot_key) !== t.version_id} />)}
            </article>;
          })}</div>
        </section>;
      })}</div>}
  </main>;
}
