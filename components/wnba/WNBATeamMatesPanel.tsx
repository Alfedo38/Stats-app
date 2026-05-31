"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Search, Users } from "lucide-react";
import { fmt, initials, qs } from "./utils";

type TeamMate = {
  id: number | string;
  full_name?: string | null;
  player_name?: string | null;
  team_abbreviation?: string | null;
  team_abbr?: string | null;
  pts?: number | null;
  reb?: number | null;
  ast?: number | null;
};

export default function WNBATeamMatesPanel({
  teamAbbr,
  players,
  currentPlayerId,
  season,
  seasonType,
}: {
  teamAbbr?: string | null;
  players: TeamMate[];
  currentPlayerId?: number | string | null;
  season: string;
  seasonType: string;
}) {
  const [query, setQuery] = useState("");
  const normalizedCurrentId = currentPlayerId ? String(currentPlayerId) : "";

  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (players || [])
      .map((p) => ({ ...p, displayName: p.full_name || p.player_name || `Jugadora ${p.id}` }))
      .filter((p) => !q || p.displayName.toLowerCase().includes(q))
      .sort((a, b) => {
        const aCurrent = String(a.id) === normalizedCurrentId;
        const bCurrent = String(b.id) === normalizedCurrentId;
        if (aCurrent && !bCurrent) return -1;
        if (!aCurrent && bCurrent) return 1;
        return (Number(b.pts) || 0) - (Number(a.pts) || 0);
      });
  }, [players, query, normalizedCurrentId]);

  return (
    <aside className="overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] shadow-2xl xl:sticky xl:top-24">
      <div className="border-b border-[var(--border)] p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#10b981]">Equipo</p>
            <h2 className="flex items-center gap-2 text-lg font-black uppercase tracking-tight text-[var(--text)]">
              <Users size={17} className="text-[#10b981]" /> {teamAbbr || "Roster"}
            </h2>
          </div>
          <span className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-[10px] font-black tabular-nums text-[var(--text-muted)]">
            {players?.length || 0}
          </span>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar compañera..."
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] py-3 pl-9 pr-3 text-xs font-bold text-[var(--text)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[#10b981]/70"
          />
        </div>
      </div>

      <div className="max-h-[560px] overflow-y-auto p-2">
        {filteredPlayers.length === 0 ? (
          <div className="p-5 text-center text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">
            Sin compañeras disponibles
          </div>
        ) : (
          filteredPlayers.map((player) => {
            const displayName = player.displayName;
            const isCurrent = String(player.id) === normalizedCurrentId;
            return (
              <Link
                key={String(player.id)}
                href={`/wnba/players/${player.id}${qs({ season, season_type: seasonType })}`}
                className={`group flex items-center gap-3 rounded-2xl border p-3 transition-all ${isCurrent ? "border-[#10b981]/40 bg-[#10b981]/10" : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-soft)]"}`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xs font-black ${isCurrent ? "border-[#10b981] bg-[#10b981] text-black" : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] group-hover:text-[var(--text)]"}`}>
                  {initials(displayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-black uppercase ${isCurrent ? "text-[#10b981]" : "text-[var(--text)]"}`}>{displayName}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    {isCurrent ? "Jugadora actual" : `${fmt(player.pts)} PTS · ${fmt(player.reb)} REB · ${fmt(player.ast)} AST`}
                  </p>
                </div>
                <ArrowUpRight size={15} className={`${isCurrent ? "text-[#10b981]" : "text-[var(--text-soft)] group-hover:text-[#10b981]"}`} />
              </Link>
            );
          })
        )}
      </div>
    </aside>
  );
}
