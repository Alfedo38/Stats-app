"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, Shield, Users, X } from "lucide-react";
import { getWNBATeamTheme } from "./wnbaTeamColors";

export type WNBASwitchTeam = {
  team_id: number;
  team_abbr: string | null;
  team_name: string | null;
};

export type WNBASwitchPlayer = {
  id: number | string;
  full_name?: string | null;
  player_name?: string | null;
  pts?: number | null;
  reb?: number | null;
  ast?: number | null;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return (parts[0] || "WN").slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function fmt(value: number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(1) : "—";
}

export default function WNBAQuickSwitcher({
  teams,
  players,
  currentTeamId,
  currentPlayerId,
  teamAbbr,
  season,
  seasonType,
}: {
  teams: WNBASwitchTeam[];
  players: WNBASwitchPlayer[];
  currentTeamId?: number | string | null;
  currentPlayerId?: number | string | null;
  teamAbbr?: string | null;
  season: string;
  seasonType: string;
}) {
  const [panel, setPanel] = useState<"teams" | "players" | null>(null);
  const [query, setQuery] = useState("");
  const theme = getWNBATeamTheme(teamAbbr);
  const queryString = `season=${encodeURIComponent(season)}&season_type=${encodeURIComponent(seasonType)}`;

  useEffect(() => {
    if (!panel) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setPanel(null);
    document.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = "";
    };
  }, [panel]);

  useEffect(() => setQuery(""), [panel]);

  const filteredTeams = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...(teams || [])]
      .filter((team) => !q || `${team.team_abbr || ""} ${team.team_name || ""}`.toLowerCase().includes(q))
      .sort((a, b) => String(a.team_name || a.team_abbr).localeCompare(String(b.team_name || b.team_abbr)));
  }, [teams, query]);

  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...(players || [])]
      .map((player) => ({ ...player, name: player.full_name || player.player_name || `Jugadora ${player.id}` }))
      .filter((player) => !q || player.name.toLowerCase().includes(q))
      .sort((a, b) => (Number(b.pts) || 0) - (Number(a.pts) || 0));
  }, [players, query]);

  return (
    <>
      <div className="fixed bottom-4 left-4 z-[80] flex overflow-hidden rounded-full border bg-[#07110e]/95 shadow-[0_12px_36px_rgba(0,0,0,.6)] backdrop-blur md:left-[88px]" style={{ borderColor: `${theme.primary}55` }}>
        <button type="button" onClick={() => setPanel("teams")} className="inline-flex h-11 items-center gap-2 px-3 text-[9px] font-black uppercase tracking-widest text-white hover:bg-white/5">
          <Shield size={14} style={{ color: theme.primary }} />
          <span>Equipos</span>
        </button>
        <button type="button" onClick={() => setPanel("players")} className="inline-flex h-11 items-center gap-2 border-l border-white/10 px-3 text-[9px] font-black uppercase tracking-widest text-white hover:bg-white/5">
          <Users size={14} style={{ color: theme.primary }} />
          <span>Jugadoras</span>
        </button>
      </div>

      {panel && (
        <div className="fixed inset-y-0 left-0 right-0 z-[270] md:left-[72px]" role="dialog" aria-modal="true" aria-label={panel === "teams" ? "Cambiar equipo" : "Cambiar jugadora"}>
          <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setPanel(null)} aria-label="Cerrar selector" />
          <aside className="absolute inset-y-0 left-0 flex w-[min(100vw,430px)] flex-col border-r bg-[var(--bg)] p-4 shadow-2xl" style={{ borderColor: `${theme.primary}44` }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[.24em]" style={{ color: theme.primary }}>Acceso rápido</p>
                <h2 className="text-xl font-black uppercase text-[var(--text)]">{panel === "teams" ? "Cambiar equipo" : `Plantel ${teamAbbr || ""}`}</h2>
              </div>
              <button type="button" onClick={() => setPanel(null)} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-white" aria-label="Cerrar"><X size={18} /></button>
            </div>

            <label className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 focus-within:border-[#10b981]/50">
              <Search size={15} className="text-[var(--text-muted)]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={panel === "teams" ? "Buscar equipo..." : "Buscar jugadora..."} autoFocus className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]" />
              {query && <button type="button" onClick={() => setQuery("")} className="text-[var(--text-muted)]" aria-label="Limpiar"><X size={14} /></button>}
            </label>

            {panel === "teams" ? (
              <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto pr-1">
                {filteredTeams.map((team) => {
                  const itemTheme = getWNBATeamTheme(team.team_abbr);
                  const active = String(team.team_id) === String(currentTeamId || "");
                  return (
                    <Link key={team.team_id} href={`/wnba/teams/${team.team_id}?${queryString}`} onClick={() => setPanel(null)} className="group flex min-h-24 flex-col justify-between rounded-2xl border bg-[var(--surface)] p-3 transition hover:-translate-y-0.5" style={{ borderColor: active ? `${itemTheme.primary}88` : "var(--border)" }}>
                      <span className="text-xl font-black" style={{ color: itemTheme.primary }}>{team.team_abbr || "WN"}</span>
                      <span className="text-[10px] font-bold leading-tight text-[var(--text-muted)] group-hover:text-[var(--text)]">{team.team_name || "Equipo"}</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {filteredPlayers.map((player) => {
                  const active = String(player.id) === String(currentPlayerId || "");
                  return (
                    <Link key={player.id} href={`/wnba/players/${player.id}?${queryString}`} onClick={() => setPanel(null)} className="flex items-center gap-3 rounded-2xl border p-3 transition hover:bg-[var(--surface-soft)]" style={{ borderColor: active ? `${theme.primary}88` : "var(--border)", background: active ? theme.soft : "var(--surface)" }}>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border text-xs font-black" style={{ color: theme.primary, borderColor: `${theme.primary}55` }}>{initials(player.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black uppercase text-[var(--text)]">{player.name}</span>
                        <span className="block text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">{fmt(player.pts)} PTS · {fmt(player.reb)} REB · {fmt(player.ast)} AST</span>
                      </span>
                    </Link>
                  );
                })}
                {!filteredPlayers.length && <p className="p-8 text-center text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">Sin jugadoras para este filtro</p>}
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
