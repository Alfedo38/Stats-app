'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { PlayerAverage } from '@/lib/matchupData';
import styles from '@/app/partidos/[matchup]/Matchup.module.css';

type Player = { player_id: number; full_name: string; position: string | null };
type Stat = 'min' | 'pts' | 'reb' | 'ast' | 'fg3m' | 'fgm' | 'fga' | 'stl' | 'blk' | 'tov' | 'pra' | 'pr' | 'pa' | 'ra';
const groups: Record<string, [Stat, string][]> = {
  Principales: [['min', 'MIN'], ['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['fg3m', '3PM'], ['fgm', 'FGM'], ['fga', 'FGA']],
  Combinadas: [['min', 'MIN'], ['pr', 'PR'], ['pa', 'PA'], ['ra', 'RA'], ['pra', 'PRA']],
  Otras: [['min', 'MIN'], ['stl', 'STL'], ['blk', 'BLK'], ['tov', 'TOV']],
};
const format = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function MatchupPlayerTable({ team, roster, averages, season }: { team: string; roster: Player[]; averages: PlayerAverage[]; season: string }) {
  const [group, setGroup] = useState('Principales');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Stat>('min');
  const [descending, setDescending] = useState(true);
  const lookup = useMemo(() => new Map(averages.map(p => [p.player_id, p])), [averages]);
  const players = roster.filter(p => normalize(p.full_name).includes(normalize(query))).sort((a, b) => {
    const x = lookup.get(a.player_id)?.[sort];
    const y = lookup.get(b.player_id)?.[sort];
    if (x == null && y == null) return a.full_name.localeCompare(b.full_name);
    if (x == null) return 1;
    if (y == null) return -1;
    return (descending ? y - x : x - y) || a.full_name.localeCompare(b.full_name);
  });
  return <>
    <div className={styles.tableTools}>
      <div className={styles.tabs} aria-label={`Métricas de ${team}`}>{Object.keys(groups).map(name => <button type="button" key={name} aria-pressed={group === name} onClick={() => { setGroup(name); setSort('min'); setDescending(true); }}>{name}</button>)}</div>
      <input aria-label={`Buscar jugador de ${team}`} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar jugador…" type="search" />
    </div>
    <div className={styles.tableScroll}>
      <table className={styles.players}>
        <caption className={styles.srOnly}>Promedios de jugadores de {team}, temporada {season}</caption>
        <thead><tr><th scope="col">Jugador</th><th scope="col" title="Partidos jugados incluidos en el promedio">PJ</th>{groups[group].map(([key, label]) => <th scope="col" key={key} aria-sort={sort === key ? descending ? 'descending' : 'ascending' : 'none'}><button type="button" onClick={() => { setDescending(sort === key ? !descending : true); setSort(key); }}>{label}{sort === key ? descending ? ' ↓' : ' ↑' : ''}</button></th>)}</tr></thead>
        <tbody>{players.map(player => {
          const avg = lookup.get(player.player_id);
          return <tr key={player.player_id}>
            <th scope="row"><Link href={`/players/${player.player_id}`} className={styles.playerName}>{player.full_name}</Link><small>{player.position || 'Jugador'}{avg ? ` · Historial: ${avg.historical_teams}` : ` · Sin datos en ${season}`}</small></th>
            <td title={avg ? `${avg.first_date} a ${avg.last_date}` : 'Sin partidos para estos filtros'}>{avg?.gp ?? '—'}</td>
            {groups[group].map(([key]) => <td key={key}>{format(avg?.[key])}</td>)}
          </tr>;
        })}</tbody>
      </table>
      {players.length === 0 && <p className={styles.empty}>{roster.length ? 'No hay jugadores con ese nombre.' : 'Sin plantel disponible para este equipo.'}</p>}
    </div>
    <p className={styles.footnote}>PJ cuenta apariciones con minutos. Los promedios incluyen sus equipos de {season}; pueden ser distintos del equipo actual.</p>
  </>;
}
