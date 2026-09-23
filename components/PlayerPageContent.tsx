"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, X } from "lucide-react";
import DvpPanel from "@/components/DvpPanel";
import TeamMatesPanel, { type TeamMate } from "@/components/TeamMatesPanel";
import PlayerChartContainer from "@/components/PlayerChartContainer";
import type { ActiveFilter } from "@/components/StatFilters";
import type { GameSlot } from "@/lib/api";

type StakeOdd = {
  player_name: string;
  prop_type: string;
  line: number | null;
  matchup: string | null;
  over_price: number | null;
  under_price: number | null;
  updated_at: string | null;
  book?: string | null;
  source?: string | null;
};

interface PlayerPageContentProps {
  stats: any[];
  navStats: { id: string; label: string }[];
  playerName: string;
  initialStat?: string;
  stakeOdds: StakeOdd[];
  teammates: TeamMate[];
  teamAbbr: string | null;
  currentPlayerId: string;
  games: GameSlot[];
  position?: string;
  lastOpponent?: string;
  nextOpponent?: string | null;
  nextHomeAway?: "HOME" | "AWAY" | string | null;
  nextGameDate?: string | null;
  activeInjuryContext?: any[];
}


type ClientTeammatesCacheEntry = {
  expiresAt: number;
  players: TeamMate[];
};

const TEAMMATES_CLIENT_CACHE = new Map<string, ClientTeammatesCacheEntry>();
const TEAMMATES_CLIENT_TTL_MS = 5 * 60 * 1000;

export default function PlayerPageContent({
  stats,
  navStats,
  playerName,
  initialStat = "pts",
  stakeOdds,
  teammates,
  teamAbbr,
  currentPlayerId,
  games,
  position,
  lastOpponent,
  nextOpponent,
  nextHomeAway,
  nextGameDate,
  activeInjuryContext,
}: PlayerPageContentProps) {
  const [selectedGame, setSelectedGame] = useState<GameSlot | null>(null);
  const [externalFilters, setExternalFilters] = useState<ActiveFilter[]>([]);
  const [dvpOpponentFromFilters, setDvpOpponentFromFilters] = useState<string | null>(null);
  const [clientTeammates, setClientTeammates] = useState<TeamMate[]>(teammates || []);
  const [rosterOpen, setRosterOpen] = useState(false);

  useEffect(() => {
    setDvpOpponentFromFilters(null);
    setRosterOpen(false);
  }, [currentPlayerId]);

  useEffect(() => {
    if (!rosterOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRosterOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [rosterOpen]);

  useEffect(() => {
    const team = String(teamAbbr || "").trim().toUpperCase();
    const stat = String(initialStat || "pts").trim().toLowerCase();
    const cacheKey = `${team}:${stat}:stake`;

    if (!team) {
      setClientTeammates([]);
      return;
    }

    const cached = TEAMMATES_CLIENT_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setClientTeammates(cached.players);
      return;
    }

    const controller = new AbortController();
    setClientTeammates(teammates || []);

    fetch(`/api/team-players?team=${encodeURIComponent(team)}&stat=${encodeURIComponent(stat)}&book=stake`, {
      signal: controller.signal,
      cache: "force-cache",
    })
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok && Array.isArray(json.players)) {
          TEAMMATES_CLIENT_CACHE.set(cacheKey, {
            expiresAt: Date.now() + TEAMMATES_CLIENT_TTL_MS,
            players: json.players,
          });
          setClientTeammates(json.players);
        } else {
          setClientTeammates(teammates || []);
        }
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setClientTeammates(teammates || []);
      });

    return () => controller.abort();
  }, [teamAbbr, currentPlayerId, initialStat]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      if (detail?.playerId && String(detail.playerId) !== String(currentPlayerId)) return;
      const next = String(detail?.opponent || "").trim().toUpperCase();
      setDvpOpponentFromFilters(next || null);
    };

    window.addEventListener("player-dvp-context-change", handler as EventListener);
    return () => window.removeEventListener("player-dvp-context-change", handler as EventListener);
  }, [currentPlayerId]);

  const filterTeams: string[] | undefined = selectedGame
    ? selectedGame.teams.map((t) => t.toUpperCase())
    : undefined;

  const dvpOpponent = String(
    dvpOpponentFromFilters || nextOpponent || lastOpponent || ""
  ).trim().toUpperCase();
  const dvpKey = `${currentPlayerId}:${dvpOpponent}:${position || ""}`;

  const removeExternalFilter = useCallback((id: string) => {
    setExternalFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return (
    <div className="relative min-w-0">
      <div className="fixed bottom-5 left-[68px] z-40 pointer-events-none sm:left-[76px]">
        <button
          type="button"
          onClick={() => setRosterOpen(true)}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[#10b981]/40 bg-[#071510]/95 px-3.5 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-[0_10px_35px_rgba(0,0,0,0.55)] backdrop-blur transition hover:-translate-y-0.5 hover:border-[#10b981]/70 hover:text-[#10b981]"
          aria-haspopup="dialog"
          aria-expanded={rosterOpen}
        >
          <Users size={14} className="text-[#10b981]" />
          Jugadores · {teamAbbr || "Equipo"}
          <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">
            {clientTeammates.length}
          </span>
        </button>
      </div>

      {rosterOpen && (
        <div className="fixed inset-y-0 right-0 left-14 z-[80]" role="dialog" aria-modal="true" aria-label={`Jugadores de ${teamAbbr || "equipo"}`}>
          <button
            type="button"
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setRosterOpen(false)}
            aria-label="Cerrar lista de jugadores"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(calc(100vw-56px),370px)] flex-col border-r border-[#10b981]/25 bg-[var(--bg)] p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#10b981]">Roster y líneas</p>
                <p className="text-sm font-black uppercase text-[var(--text)]">{teamAbbr || "Equipo"} · {clientTeammates.length} jugadores</p>
              </div>
              <button
                type="button"
                onClick={() => setRosterOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] transition hover:border-red-400/40 hover:text-red-300"
                aria-label="Cerrar"
              >
                <X size={17} />
              </button>
            </div>
            <TeamMatesPanel
              teamAbbr={teamAbbr}
              players={clientTeammates}
              currentPlayerId={currentPlayerId}
              games={games}
              selectedGame={selectedGame}
              onSelectGame={setSelectedGame}
              filterTeams={filterTeams}
              stakeOdds={stakeOdds}
              className="min-h-0 flex-1"
            />
          </aside>
        </div>
      )}

      <main className="flex flex-col gap-4 min-w-0 overflow-hidden">
        <PlayerChartContainer
          stats={stats}
          navStats={navStats}
          playerName={playerName}
          playerId={currentPlayerId}
          stakeOdds={stakeOdds}
          filterTeams={filterTeams}
          opponent={nextOpponent || null}
          homeAway={nextHomeAway || null}
          asOfDate={nextGameDate || null}
          externalFilters={externalFilters}
          onRemoveExternalFilter={removeExternalFilter}
          activeInjuryContext={activeInjuryContext}
        />

        {dvpOpponent && position && (
          <DvpPanel key={dvpKey} opponentAbbr={dvpOpponent} position={position} />
        )}
      </main>
    </div>
  );
}
