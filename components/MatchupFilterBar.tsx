'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import CatLoading from '@/components/CatLoading';
import type { MatchupFilters } from '@/lib/matchupFilters';
import styles from '@/app/partidos/[matchup]/Matchup.module.css';

export default function MatchupFilterBar({ path, filters, seasons, start }: { path: string; filters: MatchupFilters; seasons: string[]; start: string }) {
  const router = useRouter();
  const [pending, transition] = useTransition();
  const base = new URLSearchParams({ date: filters.date });
  if (start) base.set('start', start);
  function change(key: string, value: string) {
    const query = new URLSearchParams(base);
    query.set('season', filters.season);
    query.set('phase', filters.phase);
    query.set('venue', filters.venue);
    query.set('last', String(filters.last));
    query.set(key, value);
    transition(() => router.push(`${path}?${query}`, { scroll: false }));
  }
  return <><div className={styles.filters} aria-busy={pending}>
    <label>Temporada<select disabled={pending} value={filters.season} onChange={e => change('season', e.target.value)}>{seasons.map(season => <option key={season}>{season}</option>)}</select></label>
    <label>Fase<select disabled={pending} value={filters.phase} onChange={e => change('phase', e.target.value)}><option value="ALL">Regular + playoffs</option><option value="Regular Season">Temporada regular</option><option value="Playoffs">Playoffs</option></select></label>
    <label>Muestra<select disabled={pending} value={filters.last} onChange={e => change('last', e.target.value)}><option value="0">Toda la temporada</option><option value="5">Últimos 5</option><option value="10">Últimos 10</option></select></label>
    <label>Condición<select disabled={pending} value={filters.venue} onChange={e => change('venue', e.target.value)}><option value="ALL">Local + visitante</option><option value="MATCH">Como en este partido</option><option value="HOME">Solo local</option><option value="AWAY">Solo visitante</option></select></label>
    <button type="button" className={styles.reset} disabled={pending} onClick={() => transition(() => router.push(`${path}?${base}`, { scroll: false }))}>Restablecer filtros</button>
    <span role="status" className={styles.pending}>{pending ? 'Actualizando…' : ''}</span>
  </div>{pending && <CatLoading overlay title="Actualizando la comparativa" description="Estamos aplicando los filtros a los equipos y jugadores." />}</>;
}
