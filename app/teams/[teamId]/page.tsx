import {LEAGUE_TEAMS} from '@/lib/teams';
import { requirePageUser } from '@/lib/auth/server';
import MatchupPlayerTable from '@/components/MatchupPlayerTable';
import {getRosterPlayerAverages} from '@/lib/matchupData';
import {getPlayerEvent} from '@/lib/playerEventData';
import {getInjuryReport} from '@/lib/injuryReportData';
import {reportTimeLabel} from '@/lib/injuryReport';
import {matchupHref} from '@/lib/playerNavigation';
import {getCurrentRosterTeam} from '@/lib/currentRosters';
import {argentinaDate} from '@/lib/ticketReader/model';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { CURRENT_ROSTER_SEASON, CURRENT_ROSTER_UPDATED_AT } from '@/lib/currentRosters';

export const dynamic = 'force-dynamic';

export default async function TeamRosterPage(props: any) {
  await requirePageUser();
  try {
    const params = await Promise.resolve(props.params);

    let rawId = params?.teamId;
    if (Array.isArray(rawId)) rawId = rawId[0];
    const teamId = typeof rawId === 'string' ? rawId.trim().toUpperCase() : "";

    const roster=getCurrentRosterTeam(teamId);
    const today=argentinaDate();
    const [averages,upcoming]=await Promise.all([getRosterPlayerAverages(teamId,CURRENT_ROSTER_SEASON,today),roster[0]?getPlayerEvent(roster[0].player_id,today,'upcoming'):null]);
    const game=upcoming?.games[0],report=game?await getInjuryReport(game.date).catch(()=>null):null;
    const items=game?report?.items.filter(p=>p.team===teamId&&p.game?.id.replace(/^0+/,"")===game.id)??[]:[];
    const reportAt=items.map(p=>p.reportAt).filter((t):t is string=>!!t).sort().at(-1)??null;
    const players=roster.map(p=>({...p,id:p.player_id}));

    const getInitials = (name: string) => {
      if (!name) return "X";
      const parts = name.split(" ");
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return parts[0][0].toUpperCase();
    };

    return (
      <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans pb-20">

        <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">

          {/* ✅ FIX: Reemplazamos la <nav> con logo duplicado por un breadcrumb simple */}
          <div className="flex items-center gap-3 pt-2">
            <Link
              href="/teams"
              className="text-[var(--text-muted)] hover:text-[#10b981] transition-colors flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
            >
              <ArrowLeft size={14} /> Volver a Equipos
            </Link>
          </div>

          {/* Header del Equipo */}
          <div className="flex items-center gap-6 bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 relative overflow-hidden group hover:border-[var(--border-strong)] transition-colors">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#10b981] opacity-5 blur-[100px] rounded-full pointer-events-none" />

            <div className="w-24 h-24 rounded-full border-2 border-[var(--border)] bg-[var(--surface-soft)] flex items-center justify-center shrink-0">
              <span className="font-black text-4xl tracking-tighter text-[#10b981]">
                {teamId}
              </span>
            </div>

            <div className="z-10">
              <p className="text-[#10b981] font-bold text-[10px] uppercase tracking-[0.3em]">Plantel oficial · {CURRENT_ROSTER_SEASON}</p>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight">{LEAGUE_TEAMS.find(t=>t.id===teamId)?.name??teamId}</h1>
              <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                Referencia del plantel: {CURRENT_ROSTER_UPDATED_AT.split('-').reverse().join('/')}
              </p>
            </div>
          </div>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4" aria-label="Próximo partido"><h2 className="font-bold">Próximo partido</h2>{game?<><p className="mt-1 text-sm">{game.away} @ {game.home} · {game.date.split('-').reverse().join('/')}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{reportAt?`Parte del equipo: ${reportTimeLabel(reportAt)} · ${items.filter(p=>p.status==='OUT').length} OUT`:'Sin estados del equipo verificados para este partido.'}</p><div className="mt-2 flex flex-wrap gap-4 text-sm font-bold"><Link href={matchupHref(game.away,game.home,game.date,game.start??undefined)}>Ver previa →</Link><Link href={`/trending?date=${game.date}&game=${game.id.padStart(10,"0")}&mode=prices`}>Ver líneas →</Link><Link href={`/injuries?date=${game.date}&team=${teamId}`}>Ver parte →</Link></div></>:<p className="text-sm text-[var(--text-muted)]">No se pudo confirmar un próximo partido en el calendario disponible.</p>}</section>
          {/* Jugadores */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Users size={14} className="text-[var(--text-muted)]" />
              <h2 className="text-[var(--text-muted)] font-bold text-[10px] uppercase tracking-[0.3em]">
                Plantel actual ({players.length})
              </h2>
            </div>

            <p className="text-sm text-[var(--text-muted)]">Plantel actual y promedios con este equipo en {CURRENT_ROSTER_SEASON} · regular y playoffs. Pertenecer al plantel no confirma disponibilidad para el próximo partido.</p>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"><MatchupPlayerTable team={teamId} roster={roster} averages={averages} season={CURRENT_ROSTER_SEASON}/></div>

          </section>

        </div>
      </main>
    );
  } catch (error: any) {
    console.error("TEAM_PAGE_ERROR:", error);
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col items-center justify-center p-10 text-center">
        <h1 className="text-red-500 font-black text-3xl mb-4 uppercase tracking-tighter">
          Error de Conexión
        </h1>
        <Link
          href="/teams"
          className="mt-8 border border-[var(--border)] px-6 py-3 rounded-xl uppercase text-xs font-black tracking-widest hover:bg-[var(--surface-hover)] hover:text-[#10b981] transition-all"
        >
          Volver a Equipos
        </Link>
      </div>
    );
  }
}
