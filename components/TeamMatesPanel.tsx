"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, Users, ArrowUpRight } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type InjuryStatus = "OUT" | "DOUBTFUL" | "QUESTIONABLE" | "PROBABLE";

export type TeamMate = {
  id: number | string;
  full_name?: string | null;
  player_name?: string | null;
  team?: string | null;
  team_abbreviation?: string | null;
  /** Injury status — shows colored dot next to name */
  injury_status?: InjuryStatus | null;
  /** Hit rate 0–100 for the current active prop, e.g. 60 */
  hit_rate?: number | null;
  /** Current prop line, e.g. 14.5 */
  current_line?: number | null;
  /** Label for the current prop, e.g. "PTS" */
  current_prop?: string | null;
};

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_DOT: Record<InjuryStatus, { dot: string; title: string }> = {
  OUT:          { dot: "bg-red-500",    title: "OUT"          },
  DOUBTFUL:     { dot: "bg-red-400",    title: "Doubtful"     },
  QUESTIONABLE: { dot: "bg-orange-400", title: "Questionable" },
  PROBABLE:     { dot: "bg-yellow-400", title: "Probable"     },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function HitRateBadge({ rate }: { rate: number }) {
  const color =
    rate >= 65 ? "text-[#10b981] bg-[#10b981]/10 border-[#10b981]/25" :
    rate >= 50 ? "text-yellow-400 bg-yellow-500/10 border-yellow-400/25" :
                 "text-red-400 bg-red-500/10 border-red-400/25";

  return (
    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border tabular-nums shrink-0 ${color}`}>
      {rate}%
    </span>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

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
        // Current player always first
        const aCurr = String(a.id) === normalizedCurrentId;
        const bCurr = String(b.id) === normalizedCurrentId;
        if (aCurr && !bCurr) return -1;
        if (!aCurr && bCurr) return  1;
        // OUT players near the top (after current)
        const aOut = a.injury_status === "OUT" ? 0 : 1;
        const bOut = b.injury_status === "OUT" ? 0 : 1;
        if (aOut !== bOut) return aOut - bOut;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [players, query, normalizedCurrentId]);

  // Summary counts
  const outCount  = players.filter((p) => p.injury_status === "OUT").length;
  const gtdCount  = players.filter((p) => p.injury_status === "DOUBTFUL" || p.injury_status === "QUESTIONABLE").length;

  return (
    <aside className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-2xl xl:sticky xl:top-24">

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[9px] text-[#10b981] font-black uppercase tracking-[0.25em]">Equipo</p>
            <h2 className="text-[var(--text)] text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <Users size={17} className="text-[#10b981]" />
              {teamAbbr ?? "Roster"}
            </h2>
          </div>

          <div className="flex flex-col items-end gap-1">
            <span className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] text-[10px] font-black rounded-full px-3 py-1 tabular-nums">
              {players?.length ?? 0}
            </span>
            {/* Injury summary badges */}
            {(outCount > 0 || gtdCount > 0) && (
              <div className="flex gap-1">
                {outCount > 0 && (
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                    {outCount} OUT
                  </span>
                )}
                {gtdCount > 0 && (
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400">
                    {gtdCount} GTD
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar compañero..."
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl pl-9 pr-3 py-3 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] font-bold outline-none focus:border-[#10b981]/70 transition-colors"
          />
        </div>
      </div>

      {/* ── Player list ─────────────────────────────────────────────────────────── */}
      <div className="max-h-[520px] overflow-y-auto p-2 no-scrollbar">
        {filteredPlayers.length === 0 ? (
          <div className="p-5 text-center">
            <p className="text-[var(--text-muted)] text-xs font-black uppercase tracking-widest">
              Sin compañeros disponibles
            </p>
          </div>
        ) : (
          filteredPlayers.map((player) => {
            const isCurrent    = String(player.id) === normalizedCurrentId;
            const injStatus    = player.injury_status;
            const statusConfig = injStatus ? STATUS_DOT[injStatus] : null;
            const isOut        = injStatus === "OUT";
            const displayName  = player.displayName;

            return (
              <Link
                key={String(player.id)}
                href={`/players/${player.id}`}
                className={`group flex items-center gap-3 rounded-2xl p-3 transition-all border ${
                  isCurrent
                    ? "bg-[#10b981]/10 border-[#10b981]/40"
                    : isOut
                    ? "border-transparent opacity-50 hover:opacity-70 hover:bg-[var(--surface-soft)]"
                    : "border-transparent hover:bg-[var(--surface-soft)] hover:border-[var(--border)]"
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border font-black text-xs relative ${
                    isCurrent
                      ? "bg-[#10b981] text-black border-[#10b981]"
                      : "bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] group-hover:text-[var(--text)]"
                  }`}
                >
                  {getInitials(displayName)}

                  {/* Injury dot — bottom-right of avatar */}
                  {statusConfig && !isCurrent && (
                    <span
                      title={statusConfig.title}
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--surface)] ${statusConfig.dot}`}
                    />
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-black uppercase truncate leading-tight ${
                    isCurrent ? "text-[#10b981]" : isOut ? "text-[var(--text-muted)] line-through" : "text-[var(--text)]"
                  }`}>
                    {displayName}
                  </p>

                  {/* Subline: status label OR prop line */}
                  <p className="text-[9px] font-black uppercase tracking-widest mt-0.5 truncate">
                    {isCurrent ? (
                      <span className="text-[#10b981]">Jugador actual</span>
                    ) : injStatus ? (
                      <span className={injStatus === "OUT" ? "text-red-400" : "text-orange-400"}>
                        {STATUS_DOT[injStatus].title}
                      </span>
                    ) : player.current_line != null && player.current_prop ? (
                      <span className="text-[var(--text-muted)]">
                        {player.current_line} {player.current_prop}
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">Ver análisis</span>
                    )}
                  </p>
                </div>

                {/* Right side: hit rate badge + arrow */}
                <div className="flex items-center gap-2 shrink-0">
                  {player.hit_rate != null && !isCurrent && !isOut && (
                    <HitRateBadge rate={player.hit_rate} />
                  )}
                  <ArrowUpRight
                    size={15}
                    className={`transition-colors ${
                      isCurrent
                        ? "text-[#10b981]"
                        : "text-[var(--text-soft)] group-hover:text-[#10b981]"
                    }`}
                  />
                </div>
              </Link>
            );
          })
        )}
      </div>
    </aside>
  );
}
