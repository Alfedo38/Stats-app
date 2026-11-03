"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, BrainCircuit, X } from "lucide-react";
import TeamMatesPanel, { type TeamMate } from "@/components/TeamMatesPanel";
import {useCompactPlayer} from "@/components/PlayerPresentation";
import PlayerChartContainer from "@/components/PlayerChartContainer";
import NBAProReview from "@/components/NBAProReview";
import type { AnalysisSample } from "@/lib/nbaAnalysis";
import NBAContextExplorer from "@/components/NBAContextExplorer";
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
  analyzerStorageKey?:string;
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
  analyzerStorageKey,
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
  const compact=useCompactPlayer();
  const [analysisSample, setAnalysisSample] = useState<AnalysisSample | null>(null);
  const handleAnalysisSample = useCallback((sample: AnalysisSample) => setAnalysisSample(sample), []);
  const currentSample=analysisSample?.playerId===String(currentPlayerId)?analysisSample:null;
  const rosterStat=currentSample?.market||initialStat;
  const [selectedGame, setSelectedGame] = useState<GameSlot | null>(null);
  const [externalFilters, setExternalFilters] = useState<ActiveFilter[]>([]);
  const [resolvedEventDate,setResolvedEventDate]=useState<string|null>(null);
  const [dvpOpponentFromFilters, setDvpOpponentFromFilters] = useState<string | null>(null);
  const [clientTeammates, setClientTeammates] = useState<TeamMate[]>(teammates || []);
  const [teammatesResolvedFor,setTeammatesResolvedFor]=useState('');
  const rosterKey=`${String(teamAbbr||'').toUpperCase()}:${rosterStat}:stake`;
  const visibleTeammates=teammatesResolvedFor===rosterKey&&currentSample?.scope==='FULL'?clientTeammates:clientTeammates.map(player=>({...player,current_line:null,current_prop:null,hit_rate:null}));
  const [rosterOpen, setRosterOpen] = useState(false);
  const [detailTab,setDetailTab]=useState<"summary"|"volume"|"opponent"|"shots">("summary");
  const [contextVisited,setContextVisited]=useState(false);
  const [analysisMode, setAnalysisMode] = useState<"simple" | "pro">("simple");

  const effectiveMode=compact?"pro":analysisMode;
  useEffect(() => {
    const saved = window.localStorage.getItem("moskprops:nba-analysis-mode");
    if (saved === "pro" || saved === "simple") setAnalysisMode(saved);
  }, []);

  const changeAnalysisMode = useCallback((mode: "simple" | "pro") => {
    setAnalysisMode(mode);
    window.localStorage.setItem("moskprops:nba-analysis-mode", mode);
  }, []);

  useEffect(() => {
    setDvpOpponentFromFilters(null);setResolvedEventDate(null);setDetailTab("summary");setContextVisited(false);
    setClientTeammates(teammates||[]);
    setTeammatesResolvedFor('');
    setRosterOpen(false);
  }, [currentPlayerId]);

  useEffect(() => {
    const openRoster = () => setRosterOpen(true);
    window.addEventListener("open-player-roster", openRoster);
    return () => window.removeEventListener("open-player-roster", openRoster);
  }, []);

  useEffect(() => {
    if (!teamAbbr) return;
    window.dispatchEvent(new CustomEvent("team-context-change", { detail: { team: teamAbbr } }));
    try {
      const key = "moskprops:recent-players";
      const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
      const current = Array.isArray(parsed) ? parsed : [];
      const entry = { id: String(currentPlayerId), name: playerName, team: teamAbbr, viewedAt: Date.now() };
      window.localStorage.setItem(key, JSON.stringify([entry, ...current.filter((item: any) => String(item?.id) !== String(currentPlayerId))].slice(0, 5)));
    } catch {}
  }, [teamAbbr, currentPlayerId, playerName]);

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
    if(!rosterOpen||currentSample?.scope!=='FULL')return;
    const team = String(teamAbbr || "").trim().toUpperCase();
    const stat = String(rosterStat || "pts").trim().toLowerCase();
    const cacheKey = `${team}:${stat}:stake`;

    if (!team) {
      setClientTeammates([]);
      return;
    }

    const cached = TEAMMATES_CLIENT_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setClientTeammates(cached.players);
      setTeammatesResolvedFor(cacheKey);
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
        if (controller.signal.aborted) return;
        if (json?.ok && Array.isArray(json.players)) {
          TEAMMATES_CLIENT_CACHE.set(cacheKey, {
            expiresAt: Date.now() + TEAMMATES_CLIENT_TTL_MS,
            players: json.players,
          });
          setClientTeammates(json.players);
          setTeammatesResolvedFor(cacheKey);
        } else {
          setClientTeammates(teammates || []);
        }
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setClientTeammates(teammates || []);
      });

    return () => controller.abort();
  }, [teamAbbr, currentPlayerId, rosterStat,rosterOpen,currentSample?.scope]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      if (detail?.playerId && String(detail.playerId) !== String(currentPlayerId)) return;
      const next = String(detail?.opponent || "").trim().toUpperCase();
      setDvpOpponentFromFilters(next || null);
      setResolvedEventDate(typeof detail.eventDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(detail.eventDate)?detail.eventDate:null);
    };

    window.addEventListener("player-dvp-context-change", handler as EventListener);
    return () => window.removeEventListener("player-dvp-context-change", handler as EventListener);
  }, [currentPlayerId]);

  const filterTeams: string[] | undefined = selectedGame
    ? selectedGame.teams.map((t) => t.toUpperCase())
    : undefined;

  const dvpOpponent = String(
    resolvedEventDate!==null?(dvpOpponentFromFilters??""):(nextOpponent??"")
  ).trim().toUpperCase();
  const dvpKey = `${currentPlayerId}:${dvpOpponent}:${position || ""}`;

  const removeExternalFilter = useCallback((id: string) => {
    setExternalFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return (
    <div className="relative min-w-0">
      {rosterOpen && (
        <div className="fixed inset-y-0 right-0 left-0 z-[240] md:left-[72px]" role="dialog" aria-modal="true" aria-label={`Jugadores de ${teamAbbr || "equipo"}`}>
          <button
            type="button"
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setRosterOpen(false)}
            aria-label="Cerrar lista de jugadores"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(100vw,370px)] flex-col border-r border-[#10b981]/25 bg-[var(--bg)] p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#10b981]">Roster y líneas</p>
                <p className="text-sm font-black uppercase text-[var(--text)]">{teamAbbr || "Equipo"} · {clientTeammates.length} jugadores · {rosterStat.toUpperCase()}{currentSample?` · ${currentSample.scope} · Línea ${currentSample.line}`:""}</p>
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
              players={visibleTeammates}
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

      <main data-player-content className="flex flex-col gap-4 min-w-0 overflow-hidden">
        <section data-analysis-modes className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Modo de análisis">
            <button
              type="button"
              onClick={() => changeAnalysisMode("simple")}
              aria-pressed={analysisMode === "simple"}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-widest transition-all ${analysisMode === "simple" ? "bg-[#10b981] text-black shadow-[0_0_18px_rgba(16,185,129,0.22)]" : "text-[var(--text-muted)] hover:bg-white/[0.035] hover:text-[var(--text)]"}`}
            >
              <BarChart3 size={15} /> Vista rápida
            </button>
            <button
              type="button"
              onClick={() => changeAnalysisMode("pro")}
              aria-pressed={analysisMode === "pro"}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-widest transition-all ${analysisMode === "pro" ? "bg-cyan-300 text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.18)]" : "text-[var(--text-muted)] hover:bg-white/[0.035] hover:text-[var(--text)]"}`}
            >
              <BrainCircuit size={15} /> Análisis detallado
            </button>
          </div>

        </section>

        <PlayerChartContainer
          analyzerStorageKey={analyzerStorageKey}
          stats={stats}
          navStats={navStats}
          playerName={playerName}
          playerPosition={position}
          playerTeam={teamAbbr}
          playerId={currentPlayerId}
          stakeOdds={stakeOdds}
          filterTeams={filterTeams}
          opponent={nextOpponent || null}
          homeAway={nextHomeAway || null}
          asOfDate={nextGameDate || null}
          externalFilters={externalFilters}
          onRemoveExternalFilter={removeExternalFilter}
          activeInjuryContext={activeInjuryContext}
          analysisMode={effectiveMode}
          compact={compact}
          detailTab={detailTab}
          detailNavigation={<div data-compact-tabs className="flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1" role="tablist" aria-label="Secciones del análisis">{([{id:"summary",label:"Resumen"},{id:"volume",label:"Volumen"},{id:"opponent",label:"Rival"},{id:"shots",label:"Tiros"}] as const).map(item=><button key={item.id} type="button" role="tab" id={`analysis-tab-${item.id}`} aria-selected={detailTab===item.id} tabIndex={detailTab===item.id?0:-1} onKeyDown={event=>{const ids=["summary","volume","opponent","shots"] as const;const index=ids.indexOf(item.id);const next=event.key==="ArrowRight"?ids[(index+1)%4]:event.key==="ArrowLeft"?ids[(index+3)%4]:event.key==="Home"?ids[0]:event.key==="End"?ids[3]:null;if(next){event.preventDefault();setDetailTab(next);if(next==="opponent"||next==="shots")setContextVisited(true);document.getElementById(`analysis-tab-${next}`)?.focus();}}} aria-controls={`analysis-panel-${item.id}`} onClick={()=>{setDetailTab(item.id);if(item.id==="opponent"||item.id==="shots")setContextVisited(true);}} className={`min-h-10 flex-1 rounded-lg px-4 py-2 text-sm font-bold ${detailTab===item.id?"bg-[#10b981] text-black":"text-[var(--text-muted)] hover:text-[var(--text)]"}`}>{compact?({summary:"Rendimiento",volume:"Oportunidades",opponent:"Contra el rival",shots:"Tiros y marcas"} as const)[item.id]:item.label}</button>)}</div>}
          onAnalysisSampleChange={handleAnalysisSample}
        />

        {effectiveMode === "pro" && (
          <>
          {detailTab==="volume"&&<section id="analysis-role-panel" aria-label="Rol y estimaciones"><NBAProReview sample={analysisSample?.playerId === String(currentPlayerId) ? analysisSample : null} /></section>}
          {contextVisited&&<div hidden={detailTab!=="opponent"&&detailTab!=="shots"} id={`analysis-panel-${detailTab==="shots"?"shots":"opponent"}`} role="tabpanel" aria-labelledby={`analysis-tab-${detailTab==="shots"?"shots":"opponent"}`}>
          <NBAContextExplorer
            view={detailTab==="shots"?"shots":"opponent"}
            key={currentPlayerId}
            playerId={currentPlayerId}
            playerName={playerName}
            opponentAbbr={dvpOpponent}
            playerPosition={position}
            dvpKey={dvpKey}
            nextGameDate={resolvedEventDate??nextGameDate}
            sharedSample={analysisSample?.playerId === String(currentPlayerId) ? analysisSample : null}
          />
          </div>}
          </>
        )}
      </main>
    </div>
  );
}
