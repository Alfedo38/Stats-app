'use client';
import Link from 'next/link';

export default function MatchupError({ reset }: { reset: () => void }) {
  return <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] p-8"><h1 className="text-2xl font-bold">No pudimos cargar la comparativa</h1><p className="my-4">Revisá la conexión y que la tabla nba_team_game_logs esté cargada en la misma base que usa la aplicación.</p><button type="button" onClick={reset} className="border rounded-xl px-4 py-2 mr-4">Reintentar</button><Link href="/">Volver al inicio</Link></main>;
}
