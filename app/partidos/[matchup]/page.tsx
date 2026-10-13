import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/server';
import { LEAGUE_TEAMS } from '@/lib/teams';
import { getTeamColor } from '@/lib/teamColors';
import { CURRENT_ROSTER_SEASON, CURRENT_ROSTER_UPDATED_AT } from '@/lib/currentRosters';
import { argentinaDate, canonicalTeam, matchupFilters } from '@/lib/matchupFilters';
import { getMatchupData, getMatchupSeasons, type TeamAverage } from '@/lib/matchupData';
import MatchupFilterBar from '@/components/MatchupFilterBar';
import MatchupPlayerTable from '@/components/MatchupPlayerTable';
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
  const data = await getMatchupData(away, home, filters);
  const awayData = data.teams.find(t => t.team_abbreviation === away);
  const homeData = data.teams.find(t => t.team_abbreviation === home);
  const sample = filters.last ? `Últimos ${filters.last} partidos disponibles` : 'Toda la temporada disponible';
  return <main className={styles.page}>
    <div className={styles.wrap}>
      <Link className={styles.back} href={`/?date=${filters.date}`}>← Volver a los partidos</Link>
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
      <MatchupFilterBar path={`/partidos/${away}-${home}`} filters={filters} seasons={seasons.length ? seasons : [filters.season]} start={start} />
      <div className={styles.context}>
        <strong>Estadísticas {filters.season}</strong><span>{sample} · {filters.phase === 'ALL' ? 'Regular + playoffs' : filters.phase === 'Playoffs' ? 'Playoffs' : 'Temporada regular'}</span>
        <p>Historial anterior al {dateLabel(filters.date)}. Si elegís una fecha pasada, se excluyen los partidos posteriores y los de ese mismo día.</p>
      </div>
      <div className={styles.sampleGrid}>{[away, home].map(team => {
        const stats = data.teams.find(t => t.team_abbreviation === team);
        return <div key={team} className={styles.sampleCard}><strong>{team}</strong><span>{stats ? `${stats.gp} partidos · ${stats.wins} victorias / ${stats.gp - stats.wins} derrotas` : 'Sin partidos para estos filtros'}</span><small>{stats ? `${dateLabel(stats.first_date)} → ${dateLabel(stats.last_date)}` : 'Probá otra fase o condición.'}</small></div>;
      })}</div>
      <div className={styles.comparisonGrid}>
        <Comparison title="Ataque y producción" metrics={offense} away={away} home={home} awayData={awayData} homeData={homeData} />
        <Comparison title="Rival y defensa" metrics={defense} away={away} home={home} awayData={awayData} homeData={homeData} />
      </div>
      <section className={styles.rosterContext}><h2>Jugadores de ambos equipos</h2><p>Planteles actuales {CURRENT_ROSTER_SEASON}, actualizados el {dateLabel(CURRENT_ROSTER_UPDATED_AT.slice(0, 10))}. Promedios de {filters.season}, incluyendo otros equipos en los que jugó cada jugador. Este plantel no reconstruye la alineación de partidos históricos ni confirma quién jugará.</p></section>
      <div className={styles.rosterGrid}>{[away, home].map(team => <section key={team} className={styles.panel}>
        <div className={styles.panelTitle}><h2>{teamName(team)}</h2><span>{team} · Plantel actual</span></div>
        <MatchupPlayerTable team={team} roster={team === away ? data.awayRoster : data.homeRoster} averages={data.players} season={filters.season} />
      </section>)}</div>
      <details className={styles.method}><summary>Cómo se calculan los promedios</summary><p>Los filtros se aplican antes de seleccionar los últimos partidos. En equipos, la muestra cuenta partidos del equipo; en jugadores, sus apariciones con minutos. «Como en este partido» compara al visitante jugando fuera y al local jugando en casa, según la condición de cada registro histórico.</p><p>Los porcentajes de tiro se calculan con el total de anotados dividido por el total de intentados. Los datos ausentes se muestran con —. PR: puntos + rebotes; PA: puntos + asistencias; RA: rebotes + asistencias; PRA: las tres. Las barras comparan cantidades y no representan probabilidades de ganar.</p></details>
    </div>
  </main>;
}
