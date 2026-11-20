import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft,ArrowUpRight} from 'lucide-react';
import {requirePageUser} from '@/lib/auth/server';
import {LEAGUE_TEAMS} from '@/lib/teams';
import {TeamLogo} from '@/components/NbaMedia';
import TeamRosterCards from '@/components/TeamRosterCards';
import {getRosterPlayerAverages} from '@/lib/matchupData';
import {getPlayerEvent} from '@/lib/playerEventData';
import {getInjuryReport} from '@/lib/injuryReportData';
import {getCurrentRosterTeam,CURRENT_ROSTER_SEASON,CURRENT_ROSTER_UPDATED_AT} from '@/lib/currentRosters';
import {argentinaDate} from '@/lib/ticketReader/model';
import {matchupHref,type GameContext} from '@/lib/playerNavigation';
import styles from '@/components/NbaVisual.module.css';
export const dynamic='force-dynamic';
export default async function TeamRosterPage({params}:{params:Promise<{teamId:string}>}){
 await requirePageUser();
 const teamId=(await params).teamId.toUpperCase(),team=LEAGUE_TEAMS.find(t=>t.id===teamId);
 if(!team)notFound();
 const roster=getCurrentRosterTeam(teamId),today=argentinaDate();
 const [summary,upcoming]=await Promise.allSettled([getRosterPlayerAverages(teamId,CURRENT_ROSTER_SEASON,today),roster[0]?getPlayerEvent(roster[0].player_id,today,'upcoming'):Promise.resolve(null)]);
 const averages=summary.status==='fulfilled'?summary.value:[],event=upcoming.status==='fulfilled'?upcoming.value:null,game=event?.games[0];
 const report=game?await getInjuryReport(game.date).catch(()=>null):null;
 const injuries=report?.items.filter(p=>p.team===teamId&&p.game?.id.replace(/^0+/,'')===game?.id.replace(/^0+/,''))??[];
 const gameContext:GameContext|undefined=game?{away:game.away,home:game.home,date:game.date,start:game.start,returnTo:`/teams/${teamId}`}:undefined;
 const rival=game?(game.home===teamId?game.away:game.home):null;
 return <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] pb-20"><div className="max-w-7xl mx-auto p-4 md:p-7 space-y-5"><Link className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]" href="/teams"><ArrowLeft size={14}/> Volver a equipos</Link>
  <header className={styles.hero}><div className={styles.identity}><TeamLogo team={teamId} size={78}/><div><p className={styles.eyebrow}>NBA · {CURRENT_ROSTER_SEASON}</p><h1>{team.name}</h1></div></div>
   {game&&rival?<section className={styles.next}><p>Próximo partido</p><Link href={matchupHref(game.away,game.home,game.date,game.start)}><TeamLogo team={rival} size={42}/><div><strong>{game.home===teamId?'Recibe a':'Visita a'} {LEAGUE_TEAMS.find(t=>t.id===rival)?.name??rival}</strong><small>{game.date.split('-').reverse().join('/')} · {new Date(game.start).toLocaleTimeString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',hour12:false})} ARG</small></div><ArrowUpRight size={15}/></Link><div className={styles.links}><Link href={`/teams/${rival}`}>Plantel rival</Link><Link href={`/trending?date=${game.date}&game=${game.id.padStart(10,'0')}&mode=prices`}>Líneas</Link><Link href={`/injuries?date=${game.date}&team=${teamId}`}>Lesiones</Link></div></section>:<section className={styles.next}><p>Próximo partido</p><small>{event?.status==='stale_roster'?'Actualizá la referencia del plantel para confirmar el rival.':event?.status==='no_game'?'Sin un partido confirmado en los próximos 7 días.':'No pudimos comprobar el calendario.'}</small></section>}
  </header>
  <TeamRosterCards team={teamId} roster={roster} averages={averages} season={CURRENT_ROSTER_SEASON} referenceAt={CURRENT_ROSTER_UPDATED_AT} gameContext={gameContext} injuries={injuries} unavailable={summary.status==='rejected'}/>
 </div></main>;
}
