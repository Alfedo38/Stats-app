"use client";

import Link from "next/link";
import { ArrowUpRight, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

export type WNBATeamRosterRow = {
  player_id: number;
  player_name: string | null;
  jersey: string | null;
  position: string | null;
  country: string | null;
};

function initials(name: string | null | undefined) {
  if (!name) return "WN";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

export default function WNBATeamRoster({ players, accent }: { players: WNBATeamRosterRow[]; accent: string }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("es");
    if (!needle) return players;
    return players.filter((player) => String(player.player_name || "").toLocaleLowerCase("es").includes(needle));
  }, [players, query]);

  return (
    <section>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div><p className="text-[9px] font-black uppercase tracking-[0.24em] text-[var(--text-muted)]">Plantel actual</p><p className="mt-1 text-sm font-black uppercase">{filtered.length} {filtered.length === 1 ? "jugadora" : "jugadoras"}</p></div>
        <label className="relative w-full md:w-[360px]">
          <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar jugadora..." className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-3.5 pl-11 pr-11 text-xs font-black outline-none transition focus:border-white/25" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg border border-white/10 p-1.5 text-[var(--text-muted)] hover:text-white"><X size={13} /></button>}
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((player) => (
          <Link key={player.player_id} href={`/wnba/players/${player.player_id}`} className="group flex min-h-[92px] items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 transition-all hover:-translate-y-0.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-sm font-black transition-all group-hover:bg-white/[0.035]" style={{ borderColor: `${accent}42`, background: `${accent}0d`, color: accent }}>{initials(player.player_name)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black uppercase tracking-tight">{player.player_name || "Jugadora"}</p>
              <p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">{[player.jersey ? `#${player.jersey}` : null, player.position, player.country].filter(Boolean).join(" · ") || "Plantel WNBA"}</p>
            </div>
            <ArrowUpRight size={16} className="shrink-0 text-white/25 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5" style={{ color: accent }} />
          </Link>
        ))}
      </div>
      {!filtered.length && <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">No encontramos jugadoras con esa búsqueda</div>}
    </section>
  );
}
