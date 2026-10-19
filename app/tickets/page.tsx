import Link from 'next/link';
import { requirePageUser } from '@/lib/auth/server';
import { argentinaToday, getTickets, validTicketDate, type Ticket } from '@/lib/ludoTickets';
import styles from './tickets.module.css';
import RefreshTickets from './RefreshTickets';

export const dynamic = 'force-dynamic';
const LABELS: Record<string, string> = { PENDING: 'Pendiente', WIN: 'Ganado', LOSS: 'Perdido',
  VOID: 'Anulado', REVIEW: 'Revisión', NO_OPTION: 'Sin opción' };
const BOOKS: Record<string, string> = { stake: 'Stake', betano: 'Betano', bet365: 'bet365' };
const fmt = (v: number | null | undefined, digits = 2) => typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—';
const time = (v: string) => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(v));
const first = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v;

function Card({ ticket, archived }: { ticket: Ticket; archived?: boolean }) {
  const p = ticket.proposal; const result = ticket.result;
  const status = result.status;
  return <article className={`${styles.card} ${archived ? styles.archived : ''}`}>
    <div className={styles.cardTop}><span className={styles.book}>{BOOKS[ticket.book]} <b>{ticket.kind}</b></span>
      <span className={styles.status} data-status={status}>{LABELS[status] || status}</span></div>
    <h2>{p.matchup}</h2>
    <div className={styles.meta}>Inicio {time(p.start_utc)} · hora argentina</div>
    {p.odds_product_reference !== null && <div className={styles.total}>×{fmt(p.odds_product_reference, 3)}<small>producto orientativo</small></div>}
    {p.status === 'NO_OPTION' ? <p className={styles.emptyReason}>{p.reason}</p> : <ul className={styles.legs}>
      {p.picks.map((leg) => {
        const outcome = result.legs.find((r) => r.row_uid === leg.row_uid);
        return <li key={leg.row_uid}>
          <div className={styles.legTitle}><Link href={`/players/${leg.player_id}`}>{leg.player_name}</Link><b>{fmt(leg.price)}</b></div>
          <div>{leg.side === 'under' ? 'Under' : 'Over'} {leg.line} {leg.prop_type}{leg.period !== 'FULL_GAME' ? ` · ${leg.period}` : ''}</div>
          <div className={styles.frequencies}><span>Últimos 10 <b>{leg.L10_hits}/{leg.L10_valid}</b></span>
            <span>Últimos 20 <b>{leg.L20_hits}/{leg.L20_valid}</b></span>
            <span>Temp. {leg.reference_season} <b>{leg.season_hits}/{leg.season_valid}</b></span></div>
          {outcome && <p className={styles.outcome} data-status={outcome.status}>
            {LABELS[outcome.status]}{outcome.actual !== null ? ` · registro: ${outcome.actual}` : ''}
            {outcome.reason && <small>{outcome.reason}</small>}</p>}
          <details><summary>Datos de la selección</summary><div className={styles.detail}>
            Historial hasta {leg.history_through}. Minutos promedio L10: {fmt(leg.minutes_L10, 1)}.
            {leg.prop_type === 'FGM' && <> FGA L10: {fmt(leg.fga_L10, 1)}. FG% L10: {leg.fg_pct_L10 == null ? '—' : fmt(leg.fg_pct_L10 * 100, 1)}%.</>}
            <br />Cuota capturada {time(leg.quote_captured_at)}. Equipo: {leg.source_team}.
          </div></details>
        </li>;
      })}
    </ul>}
    {result.reason && status !== 'NO_OPTION' && <p className={styles.emptyReason}>{result.reason}</p>}
    {result.legs.some((leg) => leg.status === 'VOID') && <p className={styles.meta}>Producto orientativo tras anulaciones: ×{fmt(result.remaining_odds_product_reference, 3)}</p>}
    <details className={styles.audit}><summary>Versión y criterio</summary><div className={styles.detail}>
      Creada {time(ticket.generated_at)}. Versión #{ticket.generation_seq}.<br />
      Corte {time(p.freeze_at)}. ID NBA: {result.nba_game_id || p.nba_game_id || 'pendiente de confirmar'}.<br />
      Parte médico: {p.context?.injury_context_available ? `consultado (${p.context.injury_snapshot_date})` : 'sin reporte reciente disponible'}.<br />
      {p.eligible_selections} selecciones elegibles. <code>{ticket.version_id.slice(0, 12)}</code>
      {Object.entries(p.exclusion_counts).length > 0 && <ul>{Object.entries(p.exclusion_counts).map(([r, n]) => <li key={r}>{r}: {n}</li>)}</ul>}
    </div></details>
  </article>;
}

export default async function TicketsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageUser();
  const params = await searchParams;
  const requested = first(params.date) || argentinaToday();
  const date = validTicketDate(requested) ? requested : argentinaToday();
  const selectedBook = first(params.book) || '';
  const book = Object.keys(BOOKS).includes(selectedBook) ? selectedBook : '';
  const history = first(params.history) === '1';
  let tickets: Ticket[] = []; let error = false;
  try { tickets = await getTickets(date, book || undefined, history); } catch { error = true; }
  const latest = new Map<string, string>();
  for (const t of tickets) if (!latest.has(t.slot_key)) latest.set(t.slot_key, t.version_id);
  tickets.sort((a, b) => a.proposal.matchup.localeCompare(b.proposal.matchup) || a.book.localeCompare(b.book) || a.kind.localeCompare(b.kind) || b.generation_seq - a.generation_seq);
  return <main className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>LUDO · NBA</p><h1>Tickets por partido</h1>
      <p>x2 y x5 para cada casa, con cuotas y aciertos históricos guardados.</p></div>
      <RefreshTickets className={styles.refresh} /></header>
    <form className={styles.filters} action="/tickets">
      <label>Jornada argentina<input name="date" type="date" defaultValue={date} required /></label>
      <label>Casa<select name="book" defaultValue={book}><option value="">Todas</option>
        {Object.entries(BOOKS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className={styles.check}><input name="history" type="checkbox" value="1" defaultChecked={history} />Ver versiones anteriores</label>
      <button type="submit">Ver tickets</button>
    </form>
    <aside className={styles.notice}>Cuotas individuales desde 1,10. Under solo en Stake. Cada ticket pertenece a un único partido y casa.
      Los aciertos pasados son frecuencias observadas; no indican la probabilidad de ganar el ticket.
      La cuota combinada de Bet Builder debe confirmarse en la casa.</aside>
    {history && <p className={styles.meta}>Historial: hasta 500 versiones de la jornada. Las anteriores aparecen atenuadas y conservan su resultado.</p>}
    {error ? <div className={styles.empty}><h2>No se pudieron cargar los tickets</h2><p>Revisá las migraciones, las variables del servidor y la sincronización. Volvé a intentar.</p></div> :
      tickets.length === 0 ? <div className={styles.empty}><h2>Aún no hay publicaciones para esta jornada</h2><p>Los tickets aparecerán cuando el motor procese las cuotas locales. Cambiá la fecha para consultar otra jornada.</p></div> :
      <section className={styles.grid}>{tickets.map((t) => <Card key={t.version_id} ticket={t} archived={latest.get(t.slot_key) !== t.version_id} />)}</section>}
    <p className={styles.foot}>La corrección usa partidos finalizados y estadísticas oficiales importadas. DNP, aplazamientos y discrepancias requieren revisión. Cada actualización conserva la propuesta original.</p>
  </main>;
}
