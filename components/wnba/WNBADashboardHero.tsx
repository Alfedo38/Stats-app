import Link from "next/link";
import { CalendarDays, Database, Shield, Users } from "lucide-react";

export default function WNBADashboardHero({ selectedDate }: { selectedDate: string }) {
  return (
    <section className="relative mb-6 overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.22),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.13),transparent_30%),var(--surface)] p-5 shadow-2xl md:p-8">
      <div className="absolute right-6 top-6 hidden rounded-full border border-[#10b981]/20 bg-[#10b981]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.26em] text-[#10b981] md:block">
        Data Center
      </div>

      <div className="relative z-10 flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-4xl">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#10b981]/25 bg-[#10b981]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-[#10b981]">
              MoskProps WNBA
            </span>
            <span className="rounded-full border border-[var(--border)] bg-black/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-[var(--text-muted)]">
              Sin EV por ahora
            </span>
          </div>

          <h1 className="text-[clamp(3rem,8vw,7.5rem)] font-black italic uppercase leading-[0.86] tracking-tighter text-[var(--text)]">
            WNBA
            <br />
            <span className="text-[#10b981]">Command Center</span>
          </h1>

          <p className="mt-5 max-w-2xl text-sm font-black uppercase tracking-[0.18em] text-[var(--text-muted)] md:text-base">
            Partidos, resultados, equipos y estadísticas de jugadoras. Nada de cuotas todavía: solo datos limpios.
          </p>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-[460px]">
          <Link href="/wnba/teams" className="group rounded-2xl border border-[var(--border)] bg-black/15 p-4 transition hover:border-[#10b981]/40 hover:bg-[#10b981]/10">
            <Shield size={18} className="mb-3 text-[#10b981]" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Explorar</p>
            <p className="mt-1 text-lg font-black uppercase tracking-tight group-hover:text-[#10b981]">Equipos</p>
          </Link>

          <Link href="/wnba/players" className="group rounded-2xl border border-[var(--border)] bg-black/15 p-4 transition hover:border-[#10b981]/40 hover:bg-[#10b981]/10">
            <Users size={18} className="mb-3 text-[#10b981]" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Buscar</p>
            <p className="mt-1 text-lg font-black uppercase tracking-tight group-hover:text-[#10b981]">Jugadoras</p>
          </Link>

          <div className="rounded-2xl border border-[var(--border)] bg-black/15 p-4">
            <CalendarDays size={18} className="mb-3 text-[#10b981]" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Fecha</p>
            <p className="mt-1 text-lg font-black uppercase tracking-tight tabular-nums">{selectedDate}</p>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-black/15 p-4">
            <Database size={18} className="mb-3 text-[#10b981]" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Fuente</p>
            <p className="mt-1 text-lg font-black uppercase tracking-tight">Postgres</p>
          </div>
        </div>
      </div>
    </section>
  );
}
