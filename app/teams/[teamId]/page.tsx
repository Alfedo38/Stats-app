import { getTeamPlayers } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function TeamRosterPage(props: any) {
  try {
    const params = await Promise.resolve(props.params);

    let rawId = params?.teamId;
    if (Array.isArray(rawId)) rawId = rawId[0];
    const teamId = typeof rawId === 'string' ? rawId.trim().toUpperCase() : "";

    let players: any[] = [];
    if (teamId) {
      const res = await getTeamPlayers(teamId);
      players = Array.isArray(res) ? res : [];
    }

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
              <p className="text-[#10b981] font-bold text-[10px] uppercase tracking-[0.3em]">Plantel Analítico</p>
              <h1 className="text-5xl font-black uppercase tracking-tighter">{teamId}</h1>
            </div>
          </div>

          {/* Jugadores */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Users size={14} className="text-[var(--text-muted)]" />
              <h2 className="text-[var(--text-muted)] font-bold text-[10px] uppercase tracking-[0.3em]">
                Jugadores Activos ({players.length})
              </h2>
            </div>

            {players.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {players.map((player: any) => {
                  const nombre = player.full_name || 'Desconocido';
                  const iniciales = getInitials(nombre);

                  return (
                    <Link
                      href={`/players/${player.id || ''}`}
                      key={player.id || Math.random()}
                      className="block no-underline"
                    >
                      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 hover:bg-[var(--surface-hover)] hover:border-[#10b981] transition-all group flex flex-col items-center justify-between min-h-[160px]">
                        <div className="w-20 h-20 bg-[var(--surface-soft)] border border-[var(--border)] rounded-full flex items-center justify-center transition-transform group-hover:scale-105 group-hover:border-[var(--border-strong)] group-hover:bg-[var(--surface-hover)]">
                          <span className="font-black text-2xl text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors">
                            {iniciales}
                          </span>
                        </div>
                        <div className="text-center w-full mt-4">
                          <h3 className="font-black text-[13px] text-[var(--text)] uppercase tracking-tight leading-tight">
                            {nombre}
                          </h3>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="text-[var(--text-muted)] text-xs font-black uppercase tracking-widest text-center py-10">
                No se encontraron jugadores para "{teamId}".
              </p>
            )}
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
