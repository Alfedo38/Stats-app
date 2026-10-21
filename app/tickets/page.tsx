import Link from 'next/link';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Ticket as TicketIcon } from 'lucide-react';
import { requirePageUser } from '@/lib/auth/server';
import { getDefaultTicketDate, getTickets, validTicketDate, type Ticket } from '@/lib/ludoTickets';
import RefreshTickets from './RefreshTickets';
import styles from './tickets.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tickets NBA | MoskProps' };
const LABELS: Record<string, string> = { PENDING: 'Pendiente', WIN: 'Ganado', LOSS: 'Perdido', VOID: 'Anulado', REVIEW: 'Revisión', NO_OPTION: 'Sin opción' };
const BOOKS: Record<string, string> = { stake: 'Stake', betano: 'Betano', bet365: 'bet365' };
const fmt = (v: number | null | undefined, digits = 2) => typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—';
const time = (v: string) => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(v));
const first = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v;
const hasPicks = (ticket: Ticket) => ticket.proposal.status === 'PROPOSED' && ticket.proposal.picks.length > 0;
const orderTickets = (a: Ticket, b: Ticket) => a.kind.localeCompare(b.kind) || (a.proposal.option_rank || 1) - (b.proposal.option_rank || 1) || b.generation_seq - a.generation_seq;
function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function unavailableReason(rows: Ticket[]) {
  if (rows.some(t => t.proposal.reason?.startsWith('Sin cuotas cargadas'))) return 'sin cuotas cargadas';
  return 'sin combinación disponible';
}

function TicketBlock({ ticket }: { ticket: Ticket }) {
  if (!hasPicks(ticket)) return null;
  const p = ticket.proposal; const result = ticket.result;
  return <details className={styles.ticket} data-status={result.status}>
    <summary className={styles.accordionSummary}>
      <div className={styles.ticketHeading}>
        <span className={styles.target}>{ticket.kind === 'x2' ? '×2' : '×5'}<small>Opción {p.option_rank || 1}</small></span>
        <span className={styles.status} data-status={result.status}>{LABELS[result.status] || result.status}</span>
      </div>
      <div className={styles.preview}>{p.picks.map(leg => <span key={leg.row_uid}>{leg.player_name}<small>{leg.side === 'under' ? 'Under' : 'Over'} {leg.line} {leg.prop_type}{leg.period === 'Q1' ? ' · 1Q' : ''}</small></span>)}</div>
      <div className={styles.summaryBottom}><span>Cuota estimada <strong>×{fmt(p.odds_product_reference, 3)}</strong></span><span className={styles.expandLabel}>Ver ticket <ChevronDown size={14} className={styles.chevron} /></span></div>
    </summary>
    <div className={styles.ticketBody}>
      {result.reason && <p className={styles.resultReason} data-status={result.status}>{result.reason}</p>}
      <ul className={styles.legs}>{p.picks.map(leg => {
        const outcome = result.legs.find(row => row.row_uid === leg.row_uid);
        return <li key={leg.row_uid}>
          <div className={styles.legTitle}><Link href={`/players/${leg.player_id}`}>{leg.player_name}</Link><b>{fmt(leg.price)}</b></div>
          <div className={styles.selection}><b>{leg.side === 'under' ? 'Under' : 'Over'} {leg.line}</b> {leg.prop_type}{leg.period === 'Q1' ? ' · 1Q' : ''}</div>
          {outcome && <div className={styles.outcome} data-status={outcome.status}>{LABELS[outcome.status] || outcome.status}{outcome.actual != null ? ` · Resultado: ${outcome.actual}` : ''}</div>}
          {outcome?.reason && <p className={styles.legReason}>{outcome.reason}</p>}
          <div className={styles.frequencies}><span>L10 <b>{leg.L10_hits}/{leg.L10_valid}</b></span><span>L20 <b>{leg.L20_hits}/{leg.L20_valid}</b></span><span>{leg.season_transition ? 'Referencia' : 'Temporada'} <b>{leg.season_hits}/{leg.season_valid}</b></span></div>
          <details className={styles.statsDetails}><summary>Estadísticas</summary><dl>
            <div><dt>Minutos L10</dt><dd>{fmt(leg.minutes_L10, 1)}</dd></div>
            <div><dt>Temporada de referencia</dt><dd>{leg.reference_season}</dd></div>
            {leg.season_transition && <div><dt>Temporada actual</dt><dd>{leg.current_season_n ?? 0} partidos previos</dd></div>}
            {leg.prop_type === 'FGM' && <><div><dt>FGA L10</dt><dd>{fmt(leg.fga_L10, 1)}</dd></div><div><dt>FG% L10</dt><dd>{leg.fg_pct_L10 == null ? '—' : `${fmt(leg.fg_pct_L10 * 100, 1)}%`}</dd></div></>}
            <div><dt>Cuota capturada</dt><dd>{time(leg.quote_captured_at)}</dd></div>
          </dl></details>
        </li>;
      })}</ul>
      {result.legs.some(leg => leg.status === 'VOID') && <div className={styles.adjusted}>Tras anulaciones <b>×{fmt(result.remaining_odds_product_reference, 3)}</b></div>}
    </div>
  </details>;
}

export default async function TicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageUser();
  const params = await searchParams;
  const requested = first(params.date);
  const date = requested && validTicketDate(requested) ? requested : await getDefaultTicketDate();
  const selectedBook = first(params.book) || '';
  const book = Object.keys(BOOKS).includes(selectedBook) ? selectedBook : '';
  const history = first(params.history) === '1';
  let tickets: Ticket[] = []; let failed = false;
  try { tickets = await getTickets(date, book || undefined, history); } catch { failed = true; }
  const latest = new Map<string, Ticket>();
  for (const ticket of tickets) if (!latest.has(ticket.slot_key) || latest.get(ticket.slot_key)!.generation_seq < ticket.generation_seq) latest.set(ticket.slot_key, ticket);
  const current = [...latest.values()];
  const active = current.filter(hasPicks);
  const gameCount = new Set(active.map(t => t.game_key)).size;
  const visible = tickets.filter(t => hasPicks(t) && (history || latest.get(t.slot_key)?.version_id === t.version_id));
  const groups = new Map<string, Ticket[]>();
  for (const ticket of visible) {
    const group = groups.get(ticket.game_key) || []; group.push(ticket); groups.set(ticket.game_key, group);
  }
  const games = [...groups.values()].sort((a, b) => a[0].proposal.start_utc.localeCompare(b[0].proposal.start_utc));
  const withoutTickets = new Map<string, Ticket[]>();
  for (const ticket of current) {
    if (active.some(t => t.game_key === ticket.game_key)) continue;
    const group = withoutTickets.get(ticket.game_key) || []; group.push(ticket); withoutTickets.set(ticket.game_key, group);
  }
  const href = (day: string) => `/tickets?date=${day}${book ? `&book=${book}` : ''}${history ? '&history=1' : ''}`;
  return <main className={styles.page}>
    <header className={styles.header}><div><div className={styles.eyebrow}><TicketIcon size={14} /> NBA</div><h1>Tickets</h1><p>{failed ? 'No pudimos cargar esta jornada.' : `${gameCount} ${gameCount === 1 ? 'partido' : 'partidos'} · ${active.length} ${active.length === 1 ? 'ticket' : 'tickets'}`}</p></div><RefreshTickets /></header>
    <div className={styles.toolbar}>
      <div className={styles.dateNav}><Link href={href(shiftDate(date, -1))} aria-label="Jornada anterior"><ChevronLeft size={19} /></Link><span><CalendarDays size={15} />{new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}</span><Link href={href(shiftDate(date, 1))} aria-label="Jornada siguiente"><ChevronRight size={19} /></Link></div>
      <form className={styles.filters} action="/tickets">
        <label><span className={styles.srOnly}>Fecha</span><input name="date" type="date" defaultValue={date} required /></label>
        <label><span className={styles.srOnly}>Casa</span><select name="book" defaultValue={book}><option value="">Todas las casas</option>{Object.entries(BOOKS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className={styles.check}><input name="history" type="checkbox" value="1" defaultChecked={history} />Historial</label><button type="submit">Ver</button>
      </form>
    </div>
    {!failed && active.length > 0 && <div className={styles.resultSummary}>{['WIN', 'LOSS', 'PENDING', 'REVIEW', 'VOID'].map(status => {
      const count = active.filter(t => t.result.status === status).length;
      return count ? <span key={status} data-status={status}><b>{count}</b> {({ WIN: 'ganados', LOSS: 'perdidos', PENDING: 'pendientes', REVIEW: 'en revisión', VOID: 'anulados' } as Record<string, string>)[status]}</span> : null;
    })}</div>}
    {failed ? <div className={styles.empty}><TicketIcon size={25} /><h2>Tickets no disponibles en este momento</h2></div> : games.length === 0 ? <div className={styles.empty}><TicketIcon size={25} /><h2>Sin tickets publicados para esta jornada</h2></div> : <div className={styles.games}>{games.map(group => {
      const sample = group[0];
      const unavailable = Object.entries(BOOKS).filter(([id]) => (!book || book === id) && !group.some(t => t.book === id && latest.get(t.slot_key)?.version_id === t.version_id));
      return <section key={sample.game_key} className={styles.game}>
        <header className={styles.gameHeading}><h2>{sample.proposal.matchup}</h2><time dateTime={sample.proposal.start_utc}>{time(sample.proposal.start_utc)}</time></header>
        {Object.entries(BOOKS).map(([id, label]) => {
          const rows = group.filter(t => t.book === id && latest.get(t.slot_key)?.version_id === t.version_id).sort(orderTickets);
          const older = group.filter(t => t.book === id && latest.get(t.slot_key)?.version_id !== t.version_id).sort(orderTickets);
          if (!rows.length && !older.length) return null;
          return <div key={id} className={styles.bookSection}><div className={styles.bookHeading} data-book={id}><i /><h3>{label}</h3><span>{rows.length} {rows.length === 1 ? 'ticket' : 'tickets'}</span></div>
            {rows.length > 0 && <div className={styles.ticketGrid}>{rows.map(t => <TicketBlock key={t.version_id} ticket={t} />)}</div>}
            {history && older.length > 0 && <details className={styles.past}><summary>Versiones anteriores <span>{older.length}</span><ChevronDown size={14} /></summary><div className={styles.ticketGrid}>{older.map(t => <TicketBlock key={t.version_id} ticket={t} />)}</div></details>}
          </div>;
        })}
        {unavailable.length > 0 && <p className={styles.unavailableBooks}>{unavailable.map(([id, label]) => `${label}: ${unavailableReason(current.filter(t => t.game_key === sample.game_key && t.book === id))}`).join(' · ')}</p>}
      </section>;
    })}</div>}
    {!failed && withoutTickets.size > 0 && <details className={styles.availability}><summary>{withoutTickets.size} {withoutTickets.size === 1 ? 'partido sin tickets' : 'partidos sin tickets'}<ChevronDown size={14} /></summary><ul>{[...withoutTickets.values()].map(group => <li key={group[0].game_key}><b>{group[0].proposal.matchup}</b><span>{Object.entries(BOOKS).filter(([id]) => group.some(t => t.book === id)).map(([id, label]) => `${label}: ${unavailableReason(group.filter(t => t.book === id))}`).join(' · ')}</span></li>)}</ul></details>}
  </main>;
}
