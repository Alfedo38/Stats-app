import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/server';
import { LEAGUE_TEAMS } from '@/lib/teams';
import { getTeamColor } from '@/lib/teamColors';
import { CURRENT_ROSTER_SEASON, CURRENT_ROSTER_UPDATED_AT } from '@/lib/currentRosters';
import { argentinaDate, canonicalTeam, matchupFilters } from '@/lib/matchupFilters';
import { getMatchupData, getMatchupSeasons, type TeamAverage } from '@/lib/matchupData';
import {getJornadaSchedule} from '@/lib/nbaJornadaData';
import {getInjuryReport} from '@/lib/injuryReportData';
import {reportTimeLabel,nbaHistoryCutoff} from '@/lib/injuryReport';
import MatchupFilterBar from '@/components/MatchupFilterBar';
import {matchupHref} from '@/lib/playerNavigation';
import MatchupPlayerTable from '@/components/MatchupPlayerTable';
import DefensiveMatchups from '@/components/DefensiveMatchups';
import {historySeasons} from '@/lib/nbaHistoryWindow';
import {archiveEnabled,archivePart} from '@/lib/nbaArchive';
import styles from './Matchup.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Comparativa del partido | MoskProps' };
type SearchParams = Record<string, string | string[] | undefined>;
type Metric = { key: keyof TeamAverage; label: string; percent?: boolean };
const offense: Metric[] = [
  { key: 'pts', label: 'Puntos' }, { key: 'reb', label: 'Rebotes' }, { key: 'ast', label: 'Asistencias' },
  { key: 'fg3m', label: 'Triples anotados' }, { key: 'fg3a', label: 'Triples intentados' },
  { key: 'fgm', label: 'Tiros anotados' }, { key: 'fga', label: 'Tiros intentados' },
  { key: 'ftm', label: 'Libres anotados' }, { key: 'fta', label: 'Libres intentados' },
  { key: 'fg_pct', label: 'Acierto de campo', percent: true }, { key: 'fg3_pct', label: 'Acierto de triples', percent: true },
  { key: 'ft_pct', label: 'Acierto de libres', percent: true },
];
const defense: Metric[] = [
  { key: 'opp_pts', label: 'Puntos recibidos' }, { key: 'opp_reb', label: 'Rebotes del rival' },
  { key: 'opp_ast', label: 'Asistencias del rival' }, { key: 'opp_fg3m', label: 'Triples del rival' },
  { key: 'stl', label: 'Robos' }, { key: 'blk', label: 'Tapones' }, { key: 'tov', label: 'Pérdidas' },
];
const number = (value: number | null, percent = false) => value == null ? '—' : `${value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${percent ? '%' : ''}`;
const teamName = (abbr: string) => LEAGUE_TEAMS.find(t => t.id === abbr)?.name ?? abbr;
const dateLabel = (date: string) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

function Comparison({ title, metrics, away, home, awayData, homeData }: { title: string; metrics: Metric[]; away: string; home: string; awayData?: TeamAverage; homeData?: TeamAverage }) {
  return <section className={styles.panel}>
    <div className={styles.panelTitle}><h2>{title}</h2><span>Promedio por partido</span></div>
    <div className={styles.comparisonHeader}><strong>{away}</strong><span>Métrica</span><strong>{home}</strong></div>
    {metrics.map(metric => {
      const a = typeof awayData?.[metric.key] === 'number' ? awayData[metric.key] as number : null;
      const h = typeof homeData?.[metric.key] === 'number' ? homeData[metric.key] as number : null;
      const max = Math.max(a ?? 0, h ?? 0, 1);
      return <div key={metric.key} className={styles.metricRow}>
        <div className={styles.metricValue}><strong>{number(a, metric.percent)}</strong><div className={styles.bar}><span style={{ width: a == null ? '0%' : `${Math.max(0, a / max * 100)}%`, background: getTeamColor(away) }} /></div></div>
        <span className={styles.metricLabel}>{metric.label}</span>
        <div className={styles.metricValue}><strong>{number(h, metric.percent)}</strong><div className={styles.bar}><span style={{ width: h == null ? '0%' : `${Math.max(0, h / max * 100)}%`, background: getTeamColor(home) }} /></div></div>
      </div>;
    })}
  </section>;
}

export default async function MatchupPage({ params, searchParams }: { params: Promise<{ matchup: string }>; searchParams: Promise<SearchParams> }) {
  await requirePageUser();
  const [{ matchup }, sp] = await Promise.all([params, searchParams]);
  const parts = matchup.split('-');
  const away = canonicalTeam(parts[0]);
  const home = canonicalTeam(parts[1]);
  if (parts.length !== 2 || !away || !home || away === home) notFound();
  const seasons = await getMatchupSeasons();
  const filters = matchupFilters(sp, seasons);
  const rawStart = Array.isArray(sp.start) ? sp.start[0] : sp.start;
  const start = rawStart && /^\d{4}-\d{2}-\d{2}T/.test(rawStart) && argentinaDate(rawStart) === filters.date ? rawStart : '';
  const cutoff=nbaHistoryCutoff({start,date:filters.date});
  const [data,injuryReport,schedule] = await Promise.all([getMatchupData(away, home, {...filters,date:cutoff}),getInjuryReport(filters.date),getJornadaSchedule(filters.date).catch(()=>[])]);
  const archiveSummary=archiveEnabled()?await archivePart('summaries').catch(()=>null):null;
  const restFor=(team:string)=>{
    const prev=[...((archiveSummary?.teamDates?.[`${historySeasons(filters.date)[0]}/${team}`]??[]) as string[])].filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&d<cutoff).sort().at(-1);
    if(!prev)return null;
    const days=(Date.parse(filters.date)-Date.parse(prev))/86400000-1;
    return Number.isInteger(days)&&days>=0?{days,prev}:null;
  };
  const matchInjuries=injuryReport.items.filter(p=>p.date===filters.date&&p.game?.away===away&&p.game?.home===home);
  const scheduled=schedule.find(g=>g.away===away&&g.home===home);
  const awayData = data.teams.find(t => t.team_abbreviation === away);
  const homeData = data.teams.find(t => t.team_abbreviation === home);
  const sample = filters.last ? `Últimos ${filters.last} partidos disponibles` : 'Toda la temporada disponible';
  return <main className={styles.page}>
    <div className={styles.wrap}>
      <Link className={styles.back} href={`/?date=${filters.date}`}>← Volver a los partidos</Link>
      <a href="#jugadores-del-partido" className={styles.back}>Ver jugadores de ambos equipos ↓</a>
      <header className={styles.hero}>
        <div className={styles.kicker}>Comparativa del enfrentamiento</div>
        <div className={styles.teamsHero}>
          {[away, home].map((team, index) => <div key={team} className={styles.teamHero}>
            <span className={styles.badge} style={{ background: `${getTeamColor(team)}20`, borderColor: `${getTeamColor(team)}60` }}>{team}</span>
            <div><small>{index === 0 ? 'Visitante' : 'Local'}</small><h1>{teamName(team)}</h1><Link href={`/teams/${team}`}>Ver equipo →</Link></div>
          </div>)}
        </div>
        <div className={styles.gameDate}>{dateLabel(filters.date)}{start && ` · ${new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(start))} ARG`}</div>
      </header>
      <section className={styles.context} aria-label="Previa del partido">
        <strong>Previa rápida</strong>
        <div className={styles.sampleGrid}>{[away,home].map(team=>{
          const rest=restFor(team),rows=matchInjuries.filter(r=>r.team===team),key=rows.filter(r=>['OUT','DOUBTFUL','QUESTIONABLE'].includes(r.status));
          return <div className={styles.sampleCard} key={team}><strong>{team}</strong><span>{rest?`${rest.days} día(s) de descanso`:'Descanso S/D'}</span><small>{key.length?key.slice(0,4).map(p=>`${p.name} · ${p.status}`).join(' / '):rows.length?'Sin bajas OUT, dudosas o en duda en el parte visible.':'Sin estados verificados para este partido.'}</small></div>;
        })}</div>
        {scheduled&&<Link className={styles.back} href={`/trending?date=${filters.date}&game=${scheduled.id}&mode=prices`}>Comparar líneas de ambos equipos →</Link>}
      </section>
      <MatchupFilterBar path={`/partidos/${away}-${home}`} filters={filters} seasons={seasons.length ? seasons : [filters.season]} start={start} />
      <div className={styles.context}>
        <strong>Estadísticas {filters.season}</strong><span>{sample} · {filters.phase === 'ALL' ? 'Regular + playoffs' : filters.phase === 'Playoffs' ? 'Playoffs' : 'Temporada regular'}</span>
        <p>Historial anterior al {dateLabel(cutoff)}. Si elegís una fecha pasada, se excluyen los partidos posteriores y los de ese mismo día.</p>
      </div>
      <div className={styles.sampleGrid}>{[away, home].map(team => {
        const stats = data.teams.find(t => t.team_abbreviation === team);
        return <div key={team} className={styles.sampleCard}><strong>{team}</strong><span>{stats ? `${stats.gp} partidos · ${stats.wins} victorias / ${stats.gp - stats.wins} derrotas` : 'Sin partidos para estos filtros'}</span><small>{stats ? `${dateLabel(stats.first_date)} → ${dateLabel(stats.last_date)}` : 'Probá otra fase o condición.'}</small></div>;
      })}</div>
      <section className={styles.panel}>
        <div className={styles.panelTitle}><h2>Ritmo y descanso</h2><span>Contexto anterior al partido</span></div>
        <div className={styles.sampleGrid}>{[away,home].map(team=>{
          const stat=data.teams.find(t=>t.team_abbreviation===team),rest=restFor(team);
          return <div key={team} className={styles.sampleCard}><strong>{team}</strong>
            <span>{number(stat?.estimated_possessions??null)} posesiones estimadas por partido</span>
            <small>{stat?.pace_games??0} partidos con datos completos para estimar ritmo.</small>
            <span>{rest?rest.days===0?'Partidos en días consecutivos':rest.days+' días sin partido':'Descanso sin dato'}</span>
            {rest&&<small>Último partido en el calendario archivado: {dateLabel(rest.prev)}.</small>}
          </div>;
        })}</div>
        <p className="text-xs text-[var(--text-muted)]">Ritmo: promedio de la estimación de posesiones de ambos equipos en cada partido de la muestra, sin ajustar por prórroga. Descanso: calendario archivado, independientemente de los filtros de localía y fase.</p>
      </section>
      <div className={styles.comparisonGrid}>
        <Comparison title="Ataque y producción" metrics={offense} away={away} home={home} awayData={awayData} homeData={homeData} />
        <Comparison title="Rival y defensa" metrics={defense} away={away} home={home} awayData={awayData} homeData={homeData} />
      </div>
      <DefensiveMatchups
        key={`${away}-${home}:${filters.date}`}
        away={away} home={home} date={filters.date} season={filters.season}
        awayRoster={data.awayRoster} homeRoster={data.homeRoster} averages={data.players}
        start={start||undefined} injuries={matchInjuries} reportAvailable={injuryReport.available}
      />
      <div className={styles.context}><strong>Parte médico del partido</strong><p>{injuryReport.available?`Reporte más reciente de la ventana: ${reportTimeLabel(injuryReport.latestReportAt)}. Cada estado conserva su captura.`:"Parte no disponible. No se confirma disponibilidad por falta de un registro."} {injuryReport.stale?"Reporte con más de 36 horas.":""}</p><Link href={`/injuries?date=${filters.date}`}>Ver parte y filtrar jugadores →</Link></div>
      <section className={styles.rosterContext}><h2 id="jugadores-del-partido">Jugadores de ambos equipos</h2><p>Planteles actuales {CURRENT_ROSTER_SEASON}, actualizados el {dateLabel(CURRENT_ROSTER_UPDATED_AT.slice(0, 10))}. Promedios de {filters.season}, incluyendo otros equipos en los que jugó cada jugador. Este plantel no reconstruye la alineación de partidos históricos ni confirma quién jugará.</p></section>
      <div className={styles.rosterGrid}>{[away, home].map(team => <section key={team} className={styles.panel}>
        <div className={styles.panelTitle}><h2>{teamName(team)}</h2><span>{team} · Plantel actual</span></div>
        <MatchupPlayerTable injuries={matchInjuries} gameContext={{away,home,date:filters.date,start:start||undefined,returnTo:matchupHref(away,home,filters.date,start||undefined,new URLSearchParams(Object.entries(sp).filter((entry):entry is [string,string]=>typeof entry[1]==='string')))}} team={team} roster={team === away ? data.awayRoster : data.homeRoster} averages={data.players} season={filters.season} />
      </section>)}</div>
      <details className={styles.method}><summary>Cómo se calculan los promedios</summary><p>Los filtros se aplican antes de seleccionar los últimos partidos. En equipos, la muestra cuenta partidos del equipo; en jugadores, sus apariciones con minutos. «Como en este partido» compara al visitante jugando fuera y al local jugando en casa, según la condición de cada registro histórico.</p><p>Los porcentajes de tiro se calculan con el total de anotados dividido por el total de intentados. Los datos ausentes se muestran con —. PR: puntos + rebotes; PA: puntos + asistencias; RA: rebotes + asistencias; PRA: las tres. Las barras comparan cantidades y no representan probabilidades de ganar.</p></details>
    </div>
  </main>;
}
