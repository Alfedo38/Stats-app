import Link from 'next/link';
import {requirePageUser} from '@/lib/auth/server';
import {LEAGUE_TEAMS} from '@/lib/teams';
import {TeamLogo} from '@/components/NbaMedia';
import styles from '@/components/NbaVisual.module.css';
export default async function TeamsDirectoryPage(){
 await requirePageUser();
 return <main className="max-w-7xl mx-auto p-4 md:p-8 text-[var(--text)]"><header className="mb-6"><p className={styles.eyebrow}>NBA</p><h1 className="text-3xl font-bold tracking-tight mt-2">Equipos y jugadores</h1><p className="text-sm text-[var(--text-muted)] mt-2">Elegí un equipo para ver su plantel, los promedios y el próximo rival.</p></header><div className={styles.directory}>{LEAGUE_TEAMS.map(team=><Link href={`/teams/${team.id}`} key={team.id} className={styles.teamTile}><TeamLogo team={team.id} size={64}/><h2>{team.name}</h2><small>Ver jugadores →</small></Link>)}</div></main>;
}
