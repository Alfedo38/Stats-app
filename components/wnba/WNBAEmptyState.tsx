import Link from "next/link";
import { CalendarSearch, Shield, Users } from "lucide-react";
import type { WNBADailyGame } from "./types";
import { dateAR, qs, timeAR } from "./utils";

export default function WNBAEmptyState({
  selectedDate,
  nextGames = [],
}: {
  selectedDate: string;
  nextGames?: WNBADailyGame[];
}) {
  const nextGame = nextGames[0];

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.10),transparent_36%),var(--surface)] p-8 text-center shadow-2xl md:p-12">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-[#10b981]/25 bg-[#10b981]/10 text-[#10b981]">
        <CalendarSearch size={28} />
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#10b981]">Sin partidos para esta fecha</p>
      <h2 className="mx-auto mt-3 max-w-3xl text-3xl font-black uppercase tracking-tighter text-[var(--text)] md:text-5xl">
        No hay juegos WNBA para {selectedDate}
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-sm font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        La sección sigue activa: podés revisar jugadoras, equipos o saltar a la próxima jornada disponible.
      </p>

      {nextGame && (
        <div className="mx-auto mt-7 max-w-2xl rounded-2xl border border-[#10b981]/25 bg-[#10b981]/10 p-4 text-left">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#10b981]">Próxima jornada detectada</p>
          <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-lg font-black uppercase tracking-tight text-[var(--text)]">
                {nextGame.away_team_abbr} @ {nextGame.home_team_abbr}
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                {dateAR(nextGame.game_date)} · {timeAR(nextGame.scheduled_at)}
              </p>
            </div>
            <Link href={qs({ date: nextGame.game_date })} className="rounded-xl bg-[#10b981] px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-black transition hover:opacity-90">
              Ir a esa fecha
            </Link>
          </div>
        </div>
      )}

      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/wnba/teams" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-5 py-3 text-xs font-black uppercase tracking-widest transition hover:border-[#10b981]/45">
          <Shield size={15} /> Ver equipos
        </Link>
        <Link href="/wnba/players" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-5 py-3 text-xs font-black uppercase tracking-widest transition hover:border-[#10b981]/45">
          <Users size={15} /> Ver jugadoras
        </Link>
      </div>
    </section>
  );
}
