"use client";

import Link from "next/link";
import { ArrowUpRight, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { getWNBATeamTheme } from "./wnbaTeamColors";

export type WNBATeamDirectoryRow = {
  team_id: number;
  team_abbr: string | null;
  team_name: string | null;
  w: number | null;
  l: number | null;
  w_pct: number | null;
  pts: number | null;
  reb: number | null;
  plus_minus: number | null;
};

function fmt(value: number | null | undefined, digits = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "—";
}

function pct(value: number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${(parsed * 100).toFixed(1)}%` : "—";
}

function signed(value: number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return `${parsed > 0 ? "+" : ""}${parsed.toFixed(1)}`;
}

export default function WNBATeamDirectory({ teams }: { teams: WNBATeamDirectoryRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("es");
    if (!needle) return teams;
    return teams.filter((team) => `${team.team_abbr || ""} ${team.team_name || ""}`.toLocaleLowerCase("es").includes(needle));
  }, [query, teams]);

  return (
    <section>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-[var(--text-muted)]">Directorio actual</p>
          <p className="mt-1 text-sm font-black uppercase">{filtered.length} {filtered.length === 1 ? "equipo encontrado" : "equipos encontrados"}</p>
        </div>
        <label className="relative w-full md:w-[360px]">
          <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o abreviatura..." className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-3.5 pl-11 pr-11 text-xs font-black outline-none transition focus:border-white/25" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg border border-white/10 p-1.5 text-[var(--text-muted)] hover:text-white"><X size={13} /></button>}
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((team, index) => {
          const abbr = String(team.team_abbr || "WNBA").toUpperCase();
          const theme = getWNBATeamTheme(abbr);
          return (
            <Link key={team.team_id} href={`/wnba/teams/${team.team_id}`} className="group relative min-h-[190px] overflow-hidden rounded-[1.35rem] border p-5 transition-all hover:-translate-y-1" style={{ borderColor: `${theme.primary}35`, background: `linear-gradient(145deg, ${theme.primary}0e, rgba(4,8,14,.97) 50%)`, boxShadow: `inset 0 1px 0 rgba(255,255,255,.035)` }}>
              <div className="pointer-events-none absolute -bottom-10 -right-4 text-[6.5rem] font-black italic leading-none opacity-[0.035]" style={{ color: theme.primary }}>{abbr}</div>
              <div className="relative z-10 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl border text-base font-black" style={{ borderColor: `${theme.primary}45`, background: `${theme.primary}0d`, color: theme.primary }}>{abbr}</span>
                  <div><p className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">#{String(index + 1).padStart(2, "0")}</p><p className="mt-1 text-sm font-black uppercase leading-tight">{team.team_name || abbr}</p></div>
                </div>
                <ArrowUpRight size={17} className="translate-y-1 text-white/25 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5" style={{ color: theme.primary }} />
              </div>
              <div className="relative z-10 mt-6 flex items-end justify-between gap-4">
                <div><p className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Efectividad</p><p className="mt-1 text-3xl font-black italic tracking-tighter" style={{ color: theme.primary }}>{pct(team.w_pct)}</p></div>
                <div className="text-right"><p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">Récord</p><p className="mt-1 text-lg font-black">{team.w ?? "—"}–{team.l ?? "—"}</p></div>
              </div>
              <div className="relative z-10 mt-4 flex items-center gap-4 border-t border-white/[0.07] pt-3 text-[9px] font-black uppercase tracking-widest text-white/50">
                <span><b className="text-white">{fmt(team.pts)}</b> PTS</span><span><b className="text-white">{fmt(team.reb)}</b> REB</span><span><b className="text-white">{signed(team.plus_minus)}</b> DIF.</span>
              </div>
            </Link>
          );
        })}
      </div>
      {!filtered.length && <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">No encontramos equipos con esa búsqueda</div>}
    </section>
  );
}
