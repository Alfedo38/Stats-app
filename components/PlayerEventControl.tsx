import type {PlayerEventState} from '@/hooks/usePlayerEvent';
export default function PlayerEventControl({event}:{event:PlayerEventState}){return <>
 <label className="text-[10px] font-bold text-[var(--text-muted)]">Fecha <input type="date" aria-label="Fecha del partido de la ficha" value={event.mode==='upcoming'?(event.context?.date??event.date):event.date} onChange={e=>event.setDate(e.target.value)} className="ml-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1"/></label>
 <button type="button" onClick={event.next} className="rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--text-muted)]">Próximo partido</button>
 {event.games.length>1&&<select aria-label="Partido de la ficha" value={event.games.find(g=>g.date===event.context?.date&&g.away===event.context.away&&g.home===event.context.home)?.id??''} onChange={e=>event.choose(e.target.value)} className="max-w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[10px]"><option value="">Elegir partido</option>{event.games.map(g=><option key={g.id} value={g.id}>{g.away} – {g.home} · {g.date.split('-').reverse().join('/')}</option>)}</select>}
 <span className="text-[11px] font-bold text-[var(--text-muted)]" role="status">{event.message}</span>
 {!event.loading&&!event.context&&<button type="button" onClick={event.retry} className="text-[10px] font-bold text-[#10b981]">Reintentar</button>}
 </>;}
