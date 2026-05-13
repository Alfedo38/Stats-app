"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, Users, ArrowUpRight } from "lucide-react";

type TeamMate = {
  id: number | string;
  full_name?: string | null;
  player_name?: string | null;
  team?: string | null;
  team_abbreviation?: string | null;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function TeamMatesPanel({
  teamAbbr,
  players,
  currentPlayerId,
}: {
  teamAbbr?: string | null;
  players: TeamMate[];
  currentPlayerId?: number | string | null;
}) {
  const [query, setQuery] = useState("");

  const normalizedCurrentId = currentPlayerId ? String(currentPlayerId) : "";

  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();

    return (players || [])
      .map((p) => ({
        ...p,
        displayName: p.full_name || p.player_name || `Jugador ${p.id}`,
      }))
      .filter((p) => !q || p.displayName.toLowerCase().includes(q))
      .sort((a, b) => {
        const aCurrent = String(a.id) === normalizedCurrentId;
        const bCurrent = String(b.id) === normalizedCurrentId;
        if (aCurrent && !bCurrent) return -1;
        if (!aCurrent && bCurrent) return 1;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [players, query, normalizedCurrentId]);

  return (
    <aside className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-2xl xl:sticky xl:top-24">
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-[9px] text-[#10b981] font-black uppercase tracking-[0.25em]">
              Equipo
            </p>
            <h2 className="text-[var(--text)] text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <Users size={17} className="text-[#10b981]" />
              {teamAbbr || "Roster"}
            </h2>
          </div>

          <span className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] text-[10px] font-black rounded-full px-3 py-1 tabular-nums">
            {players?.length || 0}
          </span>
        </div>

        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar compañero..."
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl pl-9 pr-3 py-3 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] font-bold outline-none focus:border-[#10b981]/70 transition-colors"
          />
        </div>
      </div>

      <div className="max-h-[520px] overflow-y-auto p-2 no-scrollbar">
        {filteredPlayers.length === 0 ? (
          <div className="p-5 text-center">
            <p className="text-[var(--text-muted)] text-xs font-black uppercase tracking-widest">
              Sin compañeros disponibles
            </p>
          </div>
        ) : (
          filteredPlayers.map((player) => {
            const displayName = player.displayName;
            const isCurrent = String(player.id) === normalizedCurrentId;

            return (
              <Link
                key={String(player.id)}
                href={`/players/${player.id}`}
                className={`group flex items-center gap-3 rounded-2xl p-3 transition-all border ${
                  isCurrent
                    ? "bg-[#10b981]/10 border-[#10b981]/40"
                    : "border-transparent hover:bg-[var(--surface-soft)] hover:border-[var(--border)]"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border font-black text-xs ${
                    isCurrent
                      ? "bg-[#10b981] text-black border-[#10b981]"
                      : "bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] group-hover:text-[var(--text)]"
                  }`}
                >
                  {getInitials(displayName)}
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-black uppercase truncate ${
                      isCurrent ? "text-[#10b981]" : "text-[var(--text)]"
                    }`}
                  >
                    {displayName}
                  </p>
                  <p className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">
                    {isCurrent ? "Jugador actual" : "Ver análisis"}
                  </p>
                </div>

                <ArrowUpRight
                  size={15}
                  className={`shrink-0 transition-colors ${
                    isCurrent
                      ? "text-[#10b981]"
                      : "text-[var(--text-soft)] group-hover:text-[#10b981]"
                  }`}
                />
              </Link>
            );
          })
        )}
      </div>
    </aside>
  );
}
