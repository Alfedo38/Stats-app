"use client";

import { useCallback, useEffect, useState } from "react";
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

export default function PlayerPageContent({
  stats,
  navStats,
  playerName,
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

  useEffect(() => {
    setDvpOpponentFromFilters(null);
  }, [currentPlayerId]);

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

  const dvpOpponent = String(dvpOpponentFromFilters || lastOpponent || nextOpponent || "").trim().toUpperCase();
  const dvpKey = `${currentPlayerId}:${dvpOpponent}:${position || ""}`;

  const removeExternalFilter = useCallback((id: string) => {
    setExternalFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] gap-4 items-start">
      <aside className="flex flex-col gap-3 xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)] xl:overflow-hidden min-w-0">
        <TeamMatesPanel
          teamAbbr={teamAbbr}
          players={teammates}
          currentPlayerId={currentPlayerId}
          games={games}
          selectedGame={selectedGame}
          onSelectGame={setSelectedGame}
          filterTeams={filterTeams}
          stakeOdds={stakeOdds}
          className="min-h-0 flex-1"
        />
      </aside>

      <main className="flex flex-col gap-4 min-w-0 overflow-hidden">
        <PlayerChartContainer
          stats={stats}
          navStats={navStats}
          playerName={playerName}
          playerId={currentPlayerId}
          stakeOdds={stakeOdds}
          filterTeams={filterTeams}
          opponent={lastOpponent || nextOpponent || null}
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
