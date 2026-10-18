'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import type { PlayerAverage } from '@/lib/matchupData';
import { getTeamColor } from '@/lib/teamColors';
import { defensiveScenarioKey, rankedMatchupRoster, restoreDefensiveScenario, suggestDefensiveScenario, type DefensiveAssignment, type DefensiveScenario, type MatchupRosterPlayer } from '@/lib/defensiveMatchups';
import styles from './DefensiveMatchups.module.css';

type Props = { away: string; home: string; date: string; season: string; awayRoster: MatchupRosterPlayer[]; homeRoster: MatchupRosterPlayer[]; averages: PlayerAverage[] };
type Direction = 'away' | 'home';
const format = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('es-AR', { maximumFractionDigits: 1 });

export default function DefensiveMatchups({ away, home, date, season, awayRoster, homeRoster, averages }: Props) {
  const [scenario, setScenario] = useState<DefensiveScenario>(() => suggestDefensiveScenario(awayRoster, homeRoster, averages));
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState(false);
  const storageKey = defensiveScenarioKey(away, home, date);
  const lookup = useMemo(() => new Map(averages.map(player => [player.player_id, player])), [averages]);
  const allPlayers = [...awayRoster, ...homeRoster];

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setScenario(restoreDefensiveScenario(JSON.parse(raw), awayRoster, homeRoster, averages));
    } catch { /* Un navegador sin almacenamiento conserva el escenario en esta sesión. */ }
    setHydrated(true);
    // El padre remonta el panel cuando cambia el partido; cambiar filtros conserva las elecciones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(scenario)); setSaved(true); }
    catch { setSaved(false); }
  }, [scenario, storageKey, hydrated]);

  function updateRow(direction: Direction, index: number, field: 'attackerId' | 'defenderId', value: string) {
    const id = value ? Number(value) : null;
    setScenario(current => {
      const rows = current[direction].map((row, i): DefensiveAssignment => i !== index ? row : {
        ...row,
        [field]: id,
        ...(field === 'attackerId' ? { defenderId: null } : {}),
        origin: 'manual',
      });
      return restoreDefensiveScenario({ ...current, [direction]: rows }, awayRoster, homeRoster, averages);
    });
  }

  function exclude(id: number, checked: boolean) {
    setScenario(current => restoreDefensiveScenario({
      ...current,
      excluded: checked ? [...current.excluded, id] : current.excluded.filter(value => value !== id),
    }, awayRoster, homeRoster, averages));
  }

  function side(direction: Direction) {
    const attackingTeam = direction === 'away' ? away : home;
    const defendingTeam = direction === 'away' ? home : away;
    const attackers = direction === 'away' ? awayRoster : homeRoster;
    const defenders = direction === 'away' ? homeRoster : awayRoster;
    const attackOptions = rankedMatchupRoster(attackers, averages, scenario.excluded);
    const defendOptions = rankedMatchupRoster(defenders, averages, scenario.excluded);
    const selected = new Set(scenario[direction].map(row => row.attackerId));
    const bench = attackOptions.filter(player => !selected.has(player.player_id));
    const pending = scenario[direction].filter(row => row.origin === 'pending').length;
    return <section className={styles.teamPanel} style={{ '--matchup-accent': getTeamColor(attackingTeam) } as CSSProperties} aria-label={`${attackingTeam} en ataque, ${defendingTeam} en defensa`}>
      <header className={styles.teamHeading}>
        <div><span className={styles.teamCode}>{attackingTeam}</span><h3>En ataque</h3><p>Defiende {defendingTeam}</p></div>
        <span className={pending ? styles.pending : styles.ready}>{pending ? `${pending} por definir` : '5 cruces elegidos'}</span>
      </header>
      <div className={styles.columns} aria-hidden="true"><span>Atacante</span><span /><span>Marcador elegido</span></div>
      <div className={styles.rows}>{scenario[direction].map((row, index) => {
        const attacker = attackers.find(player => player.player_id === row.attackerId);
        const defender = defenders.find(player => player.player_id === row.defenderId);
        const stats = attacker ? lookup.get(attacker.player_id) : undefined;
        const defenderStats = defender ? lookup.get(defender.player_id) : undefined;
        return <article className={styles.row} key={`${direction}-${index}`}>
          <div className={styles.pair}>
            <label className={styles.selectField}><span className={styles.srOnly}>{attackingTeam}, atacante de la fila {index + 1}</span>
              <select value={row.attackerId ?? ''} onChange={event => updateRow(direction, index, 'attackerId', event.target.value)}>
                <option value="">Elegir atacante…</option>
                {attackOptions.map(player => <option value={player.player_id} key={player.player_id} disabled={selected.has(player.player_id) && player.player_id !== row.attackerId}>{player.full_name}{player.position ? ` · ${player.position}` : ''}</option>)}
              </select>
            </label>
            <span className={styles.arrow} aria-hidden="true">→</span>
            <label className={styles.selectField}><span className={styles.srOnly}>Defensor de {attacker?.full_name ?? `la fila ${index + 1}`} en {defendingTeam}</span>
              <select value={row.defenderId ?? ''} disabled={row.attackerId === null} onChange={event => updateRow(direction, index, 'defenderId', event.target.value)}>
                <option value="">Elegir defensor…</option>
                {defendOptions.map(player => <option value={player.player_id} key={player.player_id}>{player.full_name}{player.position ? ` · ${player.position}` : ''}</option>)}
              </select>
            </label>
          </div>
          <div className={styles.rowMeta}>
            <span>{attacker?.position || 'Posición sin datos'} · {stats?.min != null ? `${format(stats.min)} min de promedio` : 'Sin minutos en la muestra'}</span>
            <span className={row.origin === 'manual' ? styles.manual : ''}>{row.origin === 'suggested' ? 'Sugerido por posición' : row.origin === 'manual' ? 'Elección manual' : 'Asignación pendiente'}</span>
          </div>
          {attacker && <details className={styles.context}>
            <summary>Ver contexto del cruce</summary>
            <p className={styles.contextLabel}>Promedios del atacante · {season} · {stats?.gp ?? 0} partidos de la muestra</p>
            <dl className={styles.statGrid}>{([['min', 'MIN'], ['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['fg3m', '3PM'], ['pra', 'PRA']] as const).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{format(stats?.[key])}</dd></div>)}</dl>
            <div className={styles.contextFooter}>
              <Link href={`/players/${attacker.player_id}`}>Ficha de {attacker.full_name} ↗</Link>
              {defender && <Link href={`/players/${defender.player_id}`}>Ficha de {defender.full_name} ↗</Link>}
            </div>
            {defender && <p className={styles.note}>{defender.full_name}: {defender.position || 'posición sin datos'} · {format(defenderStats?.min)} min de promedio. Las cifras de esta fila son promedios generales de la muestra; el rendimiento individual contra este defensor aún no está disponible.</p>}
          </details>}
        </article>;
      })}</div>
      <details className={styles.bench}><summary>Resto del plantel disponible <span>{bench.length}</span></summary><p>Podés elegir cualquiera de estos jugadores en las filas de arriba.</p>
        <ul>{bench.map(player => <li key={player.player_id}><Link href={`/players/${player.player_id}`}>{player.full_name}</Link><span>{player.position || '—'} · {format(lookup.get(player.player_id)?.min)} MIN</span></li>)}</ul>
        {!bench.length && <p>Todos los jugadores disponibles ya están en el quinteto de trabajo.</p>}
      </details>
    </section>;
  }

  return <section className={styles.shell} aria-labelledby={`defensive-matchups-${away}-${home}`}>
    <header className={styles.heading}><div><span className={styles.eyebrow}>Prepará el enfrentamiento</span><h2 id={`defensive-matchups-${away}-${home}`}>¿Quién marca a quién?</h2><p>Explorá los cruces de ambos equipos. Podés cambiar cada asignación.</p></div>
      <span className={styles.saveStatus} role="status">{!hydrated ? 'Recuperando escenario…' : saved ? 'Guardado en este navegador' : 'Cambios de esta sesión'}</span>
    </header>
    <fieldset disabled={!hydrated} className={styles.fieldset}>
      <legend className={styles.srOnly}>Escenario de cruces defensivos</legend>
      <div className={styles.tools}>
        <details className={styles.availability}><summary>Excluir jugadores del escenario <span>{scenario.excluded.length || ''}</span></summary>
          <div className={styles.availabilityGrid}>{([{ team: away, roster: awayRoster }, { team: home, roster: homeRoster }]).map(({ team, roster }) => <div key={team}><strong>{team}</strong>{roster.map(player => <label key={player.player_id}><input type="checkbox" checked={scenario.excluded.includes(player.player_id)} onChange={event => exclude(player.player_id, event.target.checked)} /><span>{player.full_name}</span></label>)}</div>)}</div>
          <p className={styles.note}>Las exclusiones solo afectan a este escenario. Si quitás un jugador asignado, el cruce queda pendiente hasta que elijas un reemplazo.</p>
        </details>
        <button type="button" className={styles.suggest} onClick={() => setScenario(suggestDefensiveScenario(awayRoster, homeRoster, averages, scenario.excluded))}>Volver a sugerir cruces</button>
      </div>
      {scenario.excluded.length > 0 && <div className={styles.exclusions} aria-label="Jugadores excluidos">{scenario.excluded.map(id => <button type="button" key={id} onClick={() => exclude(id, false)} aria-label={`Volver a incluir a ${allPlayers.find(player => player.player_id === id)?.full_name ?? 'jugador'}`}>{allPlayers.find(player => player.player_id === id)?.full_name ?? 'Jugador'} <span aria-hidden="true">×</span></button>)}</div>}
      <p className={styles.explanation}>Quintetos de trabajo elegidos por minutos históricos. Los cruces iniciales se sugieren por posición; podés editarlos sin modificar el otro lado. Las alineaciones y marcas reales se confirman en el partido.</p>
      <div className={styles.grid}>{side('away')}{side('home')}</div>
    </fieldset>
  </section>;
}
