"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  getMinutesValue,
  getOpponent,
  getGameLocation,
  formatDateShort,
} from "@/lib/playerUtils";
import PlayerChart from "@/components/PlayerChart";
import SupportingDataGrid from "@/components/SupportingDataGrid";
import PickInsightPanel from "@/components/PickInsightPanel";
import PlayerHistoricalExplorer from "@/components/PlayerHistoricalExplorer";
import ActiveInjuryContextCard from "@/components/ActiveInjuryContextCard";
import StatFilters, { type ActiveFilter } from "@/components/StatFilters";
import GameLogTable from "@/components/GameLogTable";
import ShareButton from "@/components/ShareButton";
import { usePlayerUrlState } from "@/hooks/usePlayerUrlState";
import {
  Clock,
  Gauge,
  Sparkles,
  Target,
  TrendingUp,
  LayoutList,
  History,
  Loader2,
  Search,
  ShieldAlert,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type StakePlayerOdd = {
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

interface PlayerChartContainerProps {
  stats: any[];
  navStats: { id: string; label: string }[];
  playerName?: string;
  playerId?: string | number | null;
  stakeOdds?: StakePlayerOdd[];
  filterTeams?: string[];
  opponent?: string | null;
  homeAway?: "HOME" | "AWAY" | string | null;
  asOfDate?: string | null;
  /** W/O filters coming from InjuryWithWOPanel — merged with internal threshold filters */
  externalFilters?: ActiveFilter[];
  /** Called when external filters should be removed (e.g. user clicks X on a W/O chip) */
  onRemoveExternalFilter?: (id: string) => void;
  activeInjuryContext?: any[];
}

type SplitScope = "FULL" | "Q1" | "H1" | "H2_REG";
type ChartDataMode = "current" | "hist_last2" | "hist_all";
type ChartSide = "over" | "under";

function readChartSide(raw: string | null): ChartSide {
  return String(raw || "").toLowerCase() === "under" ? "under" : "over";
}

function readHomeAway(raw: string | null): "HOME" | "AWAY" | null {
  const v = String(raw || "").toUpperCase();
  return v === "HOME" || v === "AWAY" ? v : null;
}

function readMinFilter(raw: string | null): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cleanOpponentParam(raw: string | null): string {
  return String(raw || "")
    .trim()
    .toUpperCase();
}

function cleanWoParam(raw: string | null): string | null {
  const v = String(raw || "").trim();
  return v ? v : null;
}

type SplitScopeOption = {
  id: SplitScope;
  label: string;
  badgeLabel: string;
  prefix: "" | "q1" | "h1" | "h2";
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SPLIT_SCOPE_OPTIONS: SplitScopeOption[] = [
  { id: "FULL", label: "PARTIDO", badgeLabel: "DATOS PARTIDO", prefix: "" },
  {
    id: "Q1",
    label: "1ER CUARTO",
    badgeLabel: "DATOS 1ER CUARTO",
    prefix: "q1",
  },
  { id: "H1", label: "1RA MITAD", badgeLabel: "DATOS 1RA MITAD", prefix: "h1" },
  {
    id: "H2_REG",
    label: "2DA MITAD",
    badgeLabel: "DATOS 2DA MITAD",
    prefix: "h2",
  },
];

const SPLIT_SCOPE_BY_ID = SPLIT_SCOPE_OPTIONS.reduce<
  Record<SplitScope, SplitScopeOption>
>(
  (acc, o) => {
    acc[o.id] = o;
    return acc;
  },
  {} as Record<SplitScope, SplitScopeOption>,
);

const HIDDEN_MAIN_STATS = new Set([
  "potential_ast",
  "rebound_chances",
  "usage_pct",
  "touches",
  "passes_made",
]);

const NBA_TEAMS = [
  { abbr: "ATL", name: "Atlanta Hawks", short: "Hawks" },
  { abbr: "BOS", name: "Boston Celtics", short: "Celtics" },
  { abbr: "BKN", name: "Brooklyn Nets", short: "Nets" },
  { abbr: "CHA", name: "Charlotte Hornets", short: "Hornets" },
  { abbr: "CHI", name: "Chicago Bulls", short: "Bulls" },
  { abbr: "CLE", name: "Cleveland Cavaliers", short: "Cavaliers" },
  { abbr: "DAL", name: "Dallas Mavericks", short: "Mavericks" },
  { abbr: "DEN", name: "Denver Nuggets", short: "Nuggets" },
  { abbr: "DET", name: "Detroit Pistons", short: "Pistons" },
  { abbr: "GSW", name: "Golden State Warriors", short: "Warriors" },
  { abbr: "HOU", name: "Houston Rockets", short: "Rockets" },
  { abbr: "IND", name: "Indiana Pacers", short: "Pacers" },
  { abbr: "LAC", name: "LA Clippers", short: "Clippers" },
  { abbr: "LAL", name: "Los Angeles Lakers", short: "Lakers" },
  { abbr: "MEM", name: "Memphis Grizzlies", short: "Grizzlies" },
  { abbr: "MIA", name: "Miami Heat", short: "Heat" },
  { abbr: "MIL", name: "Milwaukee Bucks", short: "Bucks" },
  { abbr: "MIN", name: "Minnesota Timberwolves", short: "Timberwolves" },
  { abbr: "NOP", name: "New Orleans Pelicans", short: "Pelicans" },
  { abbr: "NYK", name: "New York Knicks", short: "Knicks" },
  { abbr: "OKC", name: "Oklahoma City Thunder", short: "Thunder" },
  { abbr: "ORL", name: "Orlando Magic", short: "Magic" },
  { abbr: "PHI", name: "Philadelphia 76ers", short: "76ers" },
  { abbr: "PHX", name: "Phoenix Suns", short: "Suns" },
  { abbr: "POR", name: "Portland Trail Blazers", short: "Trail Blazers" },
  { abbr: "SAC", name: "Sacramento Kings", short: "Kings" },
  { abbr: "SAS", name: "San Antonio Spurs", short: "Spurs" },
  { abbr: "TOR", name: "Toronto Raptors", short: "Raptors" },
  { abbr: "UTA", name: "Utah Jazz", short: "Jazz" },
  { abbr: "WAS", name: "Washington Wizards", short: "Wizards" },
];

function normalizeTeamSearch(value: string) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function findTeamByQuery(value: string) {
  const q = normalizeTeamSearch(value);
  if (!q) return null;
  return (
    NBA_TEAMS.find((team) => {
      const haystack = normalizeTeamSearch(
        `${team.abbr} ${team.name} ${team.short}`,
      );
      return team.abbr === q || haystack.includes(q);
    }) || null
  );
}

// ─── Pure helpers (unchanged from original) ───────────────────────────────────

function normalizeSplitCode(value: any): SplitScope | null {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  if (code === "Q1") return "Q1";
  if (code === "H1") return "H1";
  if (code === "H2" || code === "H2_REG") return "H2_REG";
  if (code === "FULL" || code === "PARTIDO") return "FULL";
  return null;
}

function isPeriodRowForScope(s: any, scope: SplitScope) {
  return scope !== "FULL" && normalizeSplitCode(s?.split_code) === scope;
}

function getScopedKey(statId: string, scope: SplitScope) {
  const prefix = SPLIT_SCOPE_BY_ID[scope]?.prefix;
  return prefix ? `${prefix}_${statId}` : statId;
}

function getRawStatValue(s: any, statId: string, scope: SplitScope): number {
  const isPeriodRow = isPeriodRowForScope(s, scope);
  const aliases: Record<string, string[]> = {
    "pts+ast": ["pa", "pts_ast"],
    "pts+reb": ["pr", "pts_reb"],
    "reb+ast": ["ra", "reb_ast"],
    "pts+reb+ast": ["pra", "pts_reb_ast"],
    "3pt": ["fg3m", "3pm", "three_pm"],
    "3ptm": ["fg3m", "3pm", "three_pm"],
    "3pta": ["fg3a", "three_pa"],
    "stl+blk": ["stl_blk", "stocks"],
    to: ["tov", "turnovers"],
    tov: ["to", "turnovers"],
  };
  const directCandidates = [statId, ...(aliases[statId] || [])];
  const scopedCandidates = directCandidates.flatMap((key) => [
    getScopedKey(key, scope),
    key,
  ]);
  const candidates = isPeriodRow ? directCandidates : scopedCandidates;
  for (const key of candidates) {
    if (s?.[key] !== null && s?.[key] !== undefined && s?.[key] !== "") {
      const parsed = Number(s[key]);
      if (Number.isFinite(parsed)) {
        if (statId === "usage_pct") return parsed <= 1 ? parsed * 100 : parsed;
        return parsed;
      }
    }
  }
  return 0;
}

function getStatValue(s: any, statId: string, scope: SplitScope): number {
  if (statId.includes("+")) {
    return statId
      .split("+")
      .reduce((acc, part) => acc + getRawStatValue(s, part, scope), 0);
  }
  return getRawStatValue(s, statId, scope);
}

function getScopedMinutesRaw(raw: any, scope: SplitScope) {
  if (scope === "FULL") return null;
  const prefix = SPLIT_SCOPE_BY_ID[scope]?.prefix;
  if (!prefix) return null;
  return (
    raw?.[`${prefix}_min`] ??
    raw?.[`${prefix}_minutes`] ??
    raw?.[`${prefix}_mins`] ??
    raw?.[`${prefix}_min_text`] ??
    (isPeriodRowForScope(raw, scope) ? raw?.min_text : null) ??
    null
  );
}

function formatStatValue(value: any, isPercentage?: boolean) {
  if (value === null || value === undefined || value === "") return "S/D";
  const n = Number(value);
  if (!Number.isFinite(n)) return "S/D";
  const formatted = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return isPercentage ? `${formatted}%` : formatted;
}

function getStakePropType(activeStat: string) {
  const map: Record<string, string> = {
    pts: "PTS",
    ast: "AST",
    reb: "REB",
    fgm: "FGM",
    fga: "FGA",
    fg3m: "3PT",
    fg3a: "3PTA",
    blk: "BLK",
    stl: "STL",
    "stl+blk": "STL+BLK",
    tov: "TO",
    to: "TO",
    pf: "PF",
    "pts+ast": "PA",
    "pts+reb": "PR",
    "reb+ast": "RA",
    "pts+reb+ast": "PRA",
  };
  return map[activeStat.toLowerCase()] || null;
}

function findStakeOddsForStat(
  stakeOdds: StakePlayerOdd[] | undefined,
  activeStat: string,
) {
  const propType = getStakePropType(activeStat);
  if (!propType || !stakeOdds?.length) return [];
  return stakeOdds
    .filter((o) => String(o.prop_type).toUpperCase() === propType)
    .filter((o) => o.line !== null && o.line !== undefined)
    .sort((a, b) => Number(a.line) - Number(b.line));
}

function pickPrimaryStakeOdd(odds: StakePlayerOdd[]) {
  if (!odds.length) return null;
  return [...odds].sort((a, b) => {
    const aO = Number(a.over_price),
      aU = Number(a.under_price);
    const bO = Number(b.over_price),
      bU = Number(b.under_price);
    const aB =
      Number.isFinite(aO) && Number.isFinite(aU) ? Math.abs(aO - aU) : 999;
    const bB =
      Number.isFinite(bO) && Number.isFinite(bU) ? Math.abs(bO - bU) : 999;
    if (aB !== bB) return aB - bB;
    return Number(a.line) - Number(b.line);
  })[0];
}

function formatAmericanOdd(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n > 0 ? `+${Math.round(n)}` : String(Math.round(n));
}

function formatCompactLine(line: any) {
  const n = Number(line);
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function usesIntegerLine(activeStat: string) {
  return [
    "usage_pct",
    "potential_ast",
    "rebound_chances",
    "touches",
    "passes_made",
  ].includes(activeStat);
}

function normalizeHalfLine(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0.5, Math.floor(value) + 0.5);
}

function normalizeLineForStat(value: number, activeStat: string) {
  if (!Number.isFinite(value)) return usesIntegerLine(activeStat) ? 0 : 0.5;
  if (usesIntegerLine(activeStat)) return Math.max(0, Math.round(value));
  return normalizeHalfLine(value);
}

function getLineStep(_activeStat: string) {
  return 1;
}

function getAutoLine(avg: number, activeStat: string) {
  if (usesIntegerLine(activeStat)) return Math.max(0, Math.round(avg));
  if (avg <= 1) return 0.5;
  return normalizeHalfLine(avg);
}

function adjustLine(prev: number, direction: -1 | 1, activeStat: string) {
  if (usesIntegerLine(activeStat))
    return Math.max(0, Math.round(prev) + direction);
  return Math.max(
    0.5,
    Number((normalizeHalfLine(prev) + direction).toFixed(1)),
  );
}

function formatLineValue(value: number, activeStat: string) {
  if (usesIntegerLine(activeStat)) return String(Math.round(value));
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getOpportunityOverlayConfig(activeStat: string, scope: SplitScope) {
  if (scope !== "FULL") return null;
  if (activeStat === "ast")
    return {
      key: "potential_ast",
      label: "Pot. AST",
      color: "#60a5fa",
      ratioLabel: "Conversión",
    };
  if (activeStat === "reb")
    return {
      key: "rebound_chances",
      label: "Chances Reb.",
      color: "#a78bfa",
      ratioLabel: "Captura",
    };
  return null;
}

function parseExternalPlayerFilterId(
  id: string,
): { mode: "with" | "wo"; playerId: string } | null {
  const [mode, ...rest] = id.split(":");
  const playerId = rest.join(":");
  if ((mode === "with" || mode === "wo") && playerId) return { mode, playerId };
  return null;
}

function normalizeGameId(value: any): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

const SUPPORTING_CORRELATION_METRICS = [
  "minutes",
  "usage_pct",
  "fga",
  "fg_pct",
  "fg3a",
  "fg3_pct",
  "touches",
  "potential_ast",
  "rebound_chances",
  "dreb",
  "ftm",
  "fta",
];

function getMetricValueForCorrelation(
  row: any,
  metricId: string,
): number | null {
  if (metricId === "minutes") return getMinutesValue(row);
  const raw = row?.[metricId];
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 4) return 0;

  const x = xs.slice(0, n);
  const y = ys.slice(0, n);
  const avgX = x.reduce((a, b) => a + b, 0) / n;
  const avgY = y.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - avgX;
    const dy = y[i] - avgY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  return denominator === 0 ? 0 : numerator / denominator;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlayerChartContainer({
  stats,
  navStats,
  playerName,
  playerId,
  stakeOdds = [],
  filterTeams,
  opponent,
  homeAway,
  asOfDate,
  externalFilters = [],
  onRemoveExternalFilter,
  activeInjuryContext = [],
}: PlayerChartContainerProps) {
  const searchParams = useSearchParams();

  // ── Core state — synced to URL ─────────────────────────────────────────────
  const {
    activeStat,
    setActiveStat,
    lineValue,
    setLineValue,
    lastN,
    setLastN,
    activeScope,
    setActiveScope,
    hasLineParam,
  } = usePlayerUrlState({
    defaultStat: "pts",
    defaultLine: 18.5,
    defaultN: 30,
  });

  const previousPlayerIdRef = useRef<string | number | null | undefined>(
    playerId,
  );

  useEffect(() => {
    const onExternalLine = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const nextLine = Number(detail.line);
      if (Number.isFinite(nextLine) && nextLine > 0) {
        setLineValue(nextLine);
      }
    };
    window.addEventListener("player-line-select", onExternalLine as EventListener);
    return () => window.removeEventListener("player-line-select", onExternalLine as EventListener);
  }, [setLineValue]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("player-stat-change", { detail: { stat: activeStat } }));
    window.dispatchEvent(new CustomEvent("player-line-change", { detail: { line: lineValue } }));
  }, [activeStat, lineValue]);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [showSupportingData, setShowSupportingData] = useState(true);
  const [filterResetCount, setFilterResetCount] = useState(0);
  const [externalGameIds, setExternalGameIds] = useState<
    Record<string, string[]>
  >({});

  // ── Unified chart mode ─────────────────────────────────────────────────────
  // FULL usa histórico completo unificado cuando el mercado existe; Q1/H1/H2 se quedan en data actual.
  const [chartSide, setChartSideState] = useState<ChartSide>(() =>
    readChartSide(searchParams.get("side")),
  );
  const [chartHistMinMinutes, setChartHistMinMinutesState] = useState<
    number | null
  >(() => readMinFilter(searchParams.get("min")));
  const [chartOpponentInput, setChartOpponentInput] = useState(() =>
    cleanOpponentParam(searchParams.get("opponent") || opponent || ""),
  );
  const [chartOpponent, setChartOpponentState] = useState(() =>
    cleanOpponentParam(searchParams.get("opponent") || opponent || ""),
  );
  const [chartHomeAway, setChartHomeAwayState] = useState<
    "HOME" | "AWAY" | null
  >(() => readHomeAway(searchParams.get("homeAway") || String(homeAway || "")));
  const [activeWoTeammate, setActiveWoTeammateState] = useState<string | null>(
    () => cleanWoParam(searchParams.get("wo")),
  );
  const [clientActiveInjuryContext, setClientActiveInjuryContext] = useState<
    any[]
  >([]);
  const [historicalChartData, setHistoricalChartData] = useState<any | null>(
    null,
  );
  const [historicalChartLoading, setHistoricalChartLoading] = useState(false);
  const [historicalChartError, setHistoricalChartError] = useState<
    string | null
  >(null);

  const setChartSide = useCallback((next: ChartSide) => {
    const safe = next === "under" ? "under" : "over";
    setChartSideState(safe);
  }, []);

  const setChartHistMinMinutes = useCallback((next: number | null) => {
    const n = Number(next);
    const safe = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    setChartHistMinMinutesState(safe);
  }, []);

  const setChartOpponent = useCallback((next: string | null) => {
    const safe = cleanOpponentParam(next || "");
    setChartOpponentState(safe);
  }, []);

  const setChartHomeAway = useCallback((next: "HOME" | "AWAY" | null) => {
    const safe = next === "HOME" || next === "AWAY" ? next : null;
    setChartHomeAwayState(safe);
  }, []);

  const setActiveWoTeammate = useCallback((next: string | null) => {
    const safe = cleanWoParam(next);
    setActiveWoTeammateState(safe);
  }, []);

  const resetMainFilters = useCallback(() => {
    setActiveFilters([]);
    setFilterResetCount((count) => count + 1);
    setChartSideState("over");
    setChartHistMinMinutesState(null);
    setChartOpponentState("");
    setChartOpponentInput("");
    setChartHomeAwayState(null);
    setActiveWoTeammateState(null);
  }, []);

  // ── Filter handlers ─────────────────────────────────────────────────────────

  const addOrUpdateFilter = useCallback((filter: ActiveFilter) => {
    setActiveFilters((prev) => {
      const without = prev.filter((f) => f.id !== filter.id);
      return [...without, filter];
    });
  }, []);

  const removeFilter = useCallback((id: string) => {
    setActiveFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearAllFilters = useCallback(() => {
    resetMainFilters();
  }, [resetMainFilters]);

  /** Called by SupportingDataGrid sliders */
  const handleMetricFilter = useCallback(
    (metricId: string, label: string, minValue: number | null) => {
      const filterId = `threshold:${metricId}`;
      if (minValue === null) {
        removeFilter(filterId);
      } else {
        addOrUpdateFilter({
          id: filterId,
          label,
          type: "threshold",
          value: minValue,
        });
      }
    },
    [addOrUpdateFilter, removeFilter],
  );

  const externalPlayerRefsKey = useMemo(() => {
    const refs = externalFilters
      .map((f) => parseExternalPlayerFilterId(f.id)?.playerId)
      .filter((id): id is string => Boolean(id));
    return Array.from(new Set(refs)).sort().join(",");
  }, [externalFilters]);

  useEffect(() => {
    if (!externalPlayerRefsKey) {
      setExternalGameIds({});
      return;
    }

    let cancelled = false;
    // refs acepta tanto ids numéricos como referencias codificadas team|player_name.
    // Esto evita depender del player_id de ESPN, que puede no coincidir con NBA API.
    fetch(
      `/api/player-game-ids?refs=${encodeURIComponent(externalPlayerRefsKey)}`,
    )
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((json) => {
        if (!cancelled) setExternalGameIds(json?.players || {});
      })
      .catch((err) => {
        console.warn("No pude cargar game_ids para filtros WITH/W/O:", err);
        if (!cancelled) setExternalGameIds({});
      });

    return () => {
      cancelled = true;
    };
  }, [externalPlayerRefsKey]);

  useEffect(() => {
    if (searchParams.has("opponent")) return;
    const nextOpponent = String(opponent || "").toUpperCase();
    setChartOpponentInput(nextOpponent);
    setChartOpponentState(nextOpponent);
  }, [opponent, searchParams]);

  useEffect(() => {
    if (searchParams.has("homeAway")) return;
    const nextHomeAway = String(homeAway || "").toUpperCase();
    setChartHomeAwayState(
      nextHomeAway === "HOME" || nextHomeAway === "AWAY" ? nextHomeAway : null,
    );
  }, [homeAway, searchParams]);


  // ── Derived nav stats ───────────────────────────────────────────────────────
  const visibleNavStats = useMemo(
    () => navStats.filter((stat) => !HIDDEN_MAIN_STATS.has(stat.id)),
    [navStats],
  );

  const activeStatLabel =
    visibleNavStats.find((s) => s.id === activeStat)?.label ||
    navStats.find((s) => s.id === activeStat)?.label ||
    activeStat.toUpperCase();

  const activeScopeOption = SPLIT_SCOPE_BY_ID[activeScope];
  const isFullScope = activeScope === "FULL";
  const opportunityOverlay = useMemo(
    () => getOpportunityOverlayConfig(activeStat, activeScope),
    [activeStat, activeScope],
  );
  const historicalMarket = useMemo(
    () => getStakePropType(activeStat),
    [activeStat],
  );
  const isHistoricalChartMode = isFullScope && Boolean(historicalMarket);
  const windowLabel = `L${lastN}`;

  useEffect(() => {
    if (
      !isHistoricalChartMode ||
      !historicalMarket ||
      !playerName ||
      !Number.isFinite(Number(lineValue))
    ) {
      setHistoricalChartData(null);
      setHistoricalChartLoading(false);
      return;
    }

    const controller = new AbortController();
    setHistoricalChartLoading(true);
    setHistoricalChartError(null);

    fetch("/api/player-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId,
        playerName,
        market: historicalMarket,
        line: Number(lineValue),
        side: chartSide,
        mode: "all",
        opponent: chartOpponent || null,
        homeAway: chartHomeAway,
        minMinutes: chartHistMinMinutes,
        woTeammate: activeWoTeammate,
        limit: lastN,
      }),
      signal: controller.signal,
    })
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then(({ ok, json }) => {
        if (!ok || json?.ok === false)
          throw new Error(json?.error || "Error consultando histórico");
        setHistoricalChartData(json);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setHistoricalChartError(err?.message || "Error consultando histórico");
        setHistoricalChartData(null);
      })
      .finally(() => setHistoricalChartLoading(false));

    return () => controller.abort();
  }, [
    isHistoricalChartMode,
    historicalMarket,
    playerId,
    playerName,
    lineValue,
    chartSide,
    chartOpponent,
    chartHomeAway,
    chartHistMinMinutes,
    activeWoTeammate,
    lastN,
  ]);

  // ── Stake odds ───────────────────────────────────────────────────────────────
  const selectedStakeOdds = useMemo(
    () => findStakeOddsForStat(stakeOdds, activeStat),
    [stakeOdds, activeStat],
  );
  const selectedStakeOdd = useMemo(
    () => pickPrimaryStakeOdd(selectedStakeOdds),
    [selectedStakeOdds],
  );

  // ── Raw scoped stats ─────────────────────────────────────────────────────────
  const scopedRawStats = useMemo(() => {
    const rawStats = stats || [];
    if (activeScope === "FULL") {
      const fullRows = rawStats.filter(
        (s: any) =>
          !s?.split_code || normalizeSplitCode(s.split_code) === "FULL",
      );
      return fullRows.length > 0 ? fullRows : rawStats;
    }
    const longRows = rawStats.filter(
      (s: any) => normalizeSplitCode(s?.split_code) === activeScope,
    );
    return longRows.length > 0 ? longRows : rawStats;
  }, [stats, activeScope]);

  const uniqueStats = useMemo(() => {
    return Array.from(
      new Map(
        scopedRawStats.map((s: any) => {
          const key = s.game_date
            ? String(s.game_date).split("T")[0]
            : s.date || s.id || s.game_id;
          return [key, s];
        }),
      ).values(),
    );
  }, [scopedRawStats]);

  // ── Auto-set line value ───────────────────────────────────────────────────────
  useEffect(() => {
    if (hasLineParam) return;

    if (
      isFullScope &&
      selectedStakeOdd?.line != null &&
      Number.isFinite(Number(selectedStakeOdd.line))
    ) {
      setLineValue(
        normalizeLineForStat(Number(selectedStakeOdd.line), activeStat),
      );
      return;
    }
    if (uniqueStats.length > 0) {
      const recent = uniqueStats.slice(0, 10);
      const total = recent.reduce(
        (sum, s) => sum + getStatValue(s, activeStat, activeScope),
        0,
      );
      const avg = total / (recent.length || 1);
      setLineValue(getAutoLine(avg, activeStat));
    }
  }, [
    activeStat,
    uniqueStats,
    activeScope,
    isFullScope,
    selectedStakeOdd,
    hasLineParam,
    setLineValue,
  ]);

  // ── Processed stats ───────────────────────────────────────────────────────────
  const processedStats = useMemo(() => {
    return uniqueStats.map((s: any) => {
      const rawValue = getStatValue(s, activeStat, activeScope);
      const safeValue = Number.isFinite(rawValue)
        ? Number(rawValue.toFixed(1))
        : 0;

      return {
        ...s,
        period_minutes: getScopedMinutesRaw(s, activeScope),
        value: safeValue,
        lineValue,
        game_result: s.game_result ?? s.wl ?? null,
        is_percentage: activeStat === "usage_pct",
      };
    });
  }, [uniqueStats, activeStat, activeScope, lineValue]);

  // ── Apply filters (internal threshold + external W/O) ────────────────────────
  const filteredStats = useMemo(() => {
    const windowed =
      lastN >= 999 ? processedStats : processedStats.slice(0, lastN);
    let result = windowed.reverse();

    const allFilters = [...activeFilters, ...externalFilters];

    for (const filter of allFilters) {
      if (filter.type === "threshold" && filter.value !== undefined) {
        const metricId = filter.id.replace("threshold:", "");

        if (metricId === "minutes") {
          result = result.filter((s) => {
            const m = getMinutesValue(s);
            return m === null || m >= filter.value!;
          });
        } else {
          result = result.filter((s) => {
            const raw = s?.[metricId];
            if (raw === null || raw === undefined) return true;
            const n = Number(raw);
            return Number.isNaN(n) || n >= filter.value!;
          });
        }
      }

      if (filter.type === "wo") {
        const parsed = parseExternalPlayerFilterId(filter.id);
        if (!parsed) continue;

        const teammateGameIds = new Set(externalGameIds[parsed.playerId] || []);
        if (teammateGameIds.size === 0) continue;

        result = result.filter((s) => {
          const gameId = normalizeGameId(s.game_id);
          if (!gameId) return true;
          const teammatePlayed = teammateGameIds.has(gameId);
          return parsed.mode === "with" ? teammatePlayed : !teammatePlayed;
        });
      }
    }

    return result;
  }, [processedStats, lastN, activeFilters, externalFilters, externalGameIds]);

  const visibleStats = filteredStats;

  const historicalChartStats = useMemo(() => {
    const games = Array.isArray(historicalChartData?.games)
      ? historicalChartData.games
      : [];
    return games
      .slice()
      .reverse()
      .map((g: any, index: number) => ({
        ...g,
        id: g.game_id || `${g.game_date || "hist"}-${index}`,
        game_date: g.game_date,
        value: Number(g.value) || 0,
        lineValue,
        opponent_clean: g.opponent_clean ?? g.opponent,
        opponent: g.opponent_clean ?? g.opponent,
        matchup_clean: g.matchup_clean ?? g.matchup,
        matchup: g.matchup_clean ?? g.matchup,
        minutes: g.minutes,
        min: g.minutes,
        min_clean: g.minutes,
        min_display: g.min_display ?? null,
        pts: g.pts,
        reb: g.reb,
        ast: g.ast,
        pra: g.pra,
        pr: g.pr,
        pa: g.pa,
        ra: g.ra,
        fgm: g.fgm,
        fga: g.fga,
        fg3m: g.fg3m,
        fg3a: g.fg3a,
        blk: g.blk,
        stl: g.stl,
        tov: g.tov,
        to: g.tov,
        pf: g.pf,
        stl_blk: g.stl_blk,
        potential_ast: g.potential_ast,
        rebound_chances: g.rebound_chances,
        usage_pct: g.usage_pct,
        touches: g.touches,
        home_away_clean: g.home_away_clean ?? g.home_away,
        home_away: g.home_away_clean ?? g.home_away,
        game_result: g.game_result ?? null,
        source_mode: "historical",
      }));
  }, [historicalChartData, lineValue]);

  const chartStats = isHistoricalChartMode
    ? historicalChartStats
    : visibleStats;
  const metricStats = chartStats.length > 0 ? chartStats : visibleStats;
  const supportingStats = useMemo(
    () => processedStats.slice(0, Math.min(lastN, 30)).reverse(),
    [processedStats, lastN],
  );

  // ── Derived metrics ───────────────────────────────────────────────────────────
  const avgValue =
    metricStats.length > 0
      ? (
          metricStats.reduce((a, b) => a + (Number(b.value) || 0), 0) /
          metricStats.length
        ).toFixed(1)
      : "0.0";

  const hits = metricStats.filter((s) =>
    chartSide === "under"
      ? Number(s.value) <= lineValue
      : Number(s.value) >= lineValue,
  ).length;
  const hitRateNumber =
    metricStats.length > 0 ? Math.round((hits / metricStats.length) * 100) : 0;
  const hitRate = String(hitRateNumber);

  const minutesValues = metricStats
    .map((s) => getMinutesValue(s))
    .filter((m): m is number => m !== null);
  const avgMinutes =
    minutesValues.length > 0
      ? (
          minutesValues.reduce((sum, m) => sum + m, 0) / minutesValues.length
        ).toFixed(1)
      : "S/D";

  const lowMinuteGames = minutesValues.filter((m) => m < 20).length;

  const trendLabel =
    hitRateNumber >= 60
      ? "Tendencia fuerte"
      : hitRateNumber >= 50
        ? "Tendencia media"
        : "Tendencia baja";

  const volumeLabel =
    avgMinutes === "S/D"
      ? "Sin minutos"
      : Number(avgMinutes) >= 30
        ? "Volumen alto"
        : Number(avgMinutes) >= 24
          ? "Volumen medio"
          : "Volumen bajo";

  const lineInputStep = usesIntegerLine(activeStat) ? "1" : "any";

  // ── Supporting metric más correlacionada con la prop activa ───────────────────
  const correlatedMetric = useMemo(() => {
    let bestMetric = "minutes";
    let bestScore = 0;

    for (const metricId of SUPPORTING_CORRELATION_METRICS) {
      if (metricId === activeStat) continue;

      const xs: number[] = [];
      const ys: number[] = [];
      for (const row of processedStats.slice(0, lastN)) {
        const metricValue = getMetricValueForCorrelation(row, metricId);
        const targetValue = Number(row.value);
        if (metricValue === null || !Number.isFinite(targetValue)) continue;
        xs.push(metricValue);
        ys.push(targetValue);
      }

      const score = Math.abs(pearsonCorrelation(xs, ys));
      if (score > bestScore) {
        bestScore = score;
        bestMetric = metricId;
      }
    }

    return bestMetric;
  }, [activeStat, processedStats, lastN]);

  // ── Clean slate only when the actual player changes. Do not clear filters on initial load. ──
  useEffect(() => {
    if (previousPlayerIdRef.current === playerId) return;
    previousPlayerIdRef.current = playerId;
    resetMainFilters();
  }, [playerId, resetMainFilters]);

  const selectedOpponentTeam = useMemo(
    () => (chartOpponent ? findTeamByQuery(chartOpponent) : null),
    [chartOpponent],
  );

  const opponentSuggestions = useMemo(() => {
    const q = normalizeTeamSearch(chartOpponentInput);
    const list = q
      ? NBA_TEAMS.filter((team) =>
          normalizeTeamSearch(
            `${team.abbr} ${team.name} ${team.short}`,
          ).includes(q),
        )
      : NBA_TEAMS;
    return list.slice(0, 12);
  }, [chartOpponentInput]);

  const minSliderValue = chartHistMinMinutes ?? 0;
  const minSliderLabel = chartHistMinMinutes
    ? `MIN ≥ ${chartHistMinMinutes}`
    : "Todos los minutos";
  const minSliderProgress = Math.min(
    100,
    Math.max(0, (minSliderValue / 48) * 100),
  );

  const effectiveInjuryContextDate = useMemo(() => {
    const raw = String(asOfDate || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return new Date().toISOString().slice(0, 10);
  }, [asOfDate]);

  useEffect(() => {
    if ((activeInjuryContext || []).length > 0 || !playerId) {
      setClientActiveInjuryContext([]);
      return;
    }

    const controller = new AbortController();
    fetch(
      `/api/active-injury-context?playerId=${encodeURIComponent(String(playerId))}&gameDate=${encodeURIComponent(effectiveInjuryContextDate)}`,
      {
        signal: controller.signal,
      },
    )
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok && Array.isArray(json.rows))
          setClientActiveInjuryContext(json.rows);
        else setClientActiveInjuryContext([]);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setClientActiveInjuryContext([]);
      });

    return () => controller.abort();
  }, [playerId, effectiveInjuryContextDate, activeInjuryContext]);

  const injuryContextSource =
    (activeInjuryContext || []).length > 0
      ? activeInjuryContext
      : clientActiveInjuryContext;

  const activeInjuryRows = useMemo(() => {
    return [...(injuryContextSource || [])]
      .filter((row) => row?.absent_teammate)
      .sort((a, b) => {
        const score =
          Number(b?.absent_importance_score || 0) -
          Number(a?.absent_importance_score || 0);
        if (score !== 0) return score;
        return Number(b?.games || 0) - Number(a?.games || 0);
      })
      .slice(0, 3);
  }, [injuryContextSource]);

  const hasActiveInjuryContext = activeInjuryRows.length > 0;

  // ─────────────────────────────────────────────────────────────────────────────

  const shareCurrentAnalysisUrl = useCallback(async (): Promise<boolean> => {
    try {
      const params = new URLSearchParams();
      params.set("stat", activeStat);
      params.set("line", String(lineValue));
      params.set("n", String(lastN));
      if (activeScope !== "FULL") params.set("scope", activeScope);
      if (chartSide !== "over") params.set("side", chartSide);
      if (chartHomeAway) params.set("homeAway", chartHomeAway);
      if (chartHistMinMinutes) params.set("min", String(chartHistMinMinutes));
      if (chartOpponent) params.set("opponent", chartOpponent);
      if (activeWoTeammate) params.set("wo", activeWoTeammate);
      const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }, [activeStat, lineValue, lastN, activeScope, chartSide, chartHomeAway, chartHistMinMinutes, chartOpponent, activeWoTeammate]);

  return (
    <div className="space-y-5">
      {/* MENÚ DE ESTADÍSTICAS */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 shadow-xl">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-[8px] text-[#10b981] font-black uppercase tracking-[0.22em]">
              Estadística
            </p>
            <p className="text-[11px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-1">
              Seleccioná la métrica del histórico
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[#10b981]/30 bg-[#10b981]/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#10b981]">
            {activeStatLabel}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap max-w-full pb-2 pr-2 [scrollbar-width:thin] [scrollbar-color:#10b981_#0b1018] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[var(--bg)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#10b981]/60 hover:[&::-webkit-scrollbar-thumb]:bg-[#10b981]">
          {visibleNavStats.map((stat) => {
            const active = activeStat === stat.id;
            return (
              <button
                key={stat.id}
                type="button"
                onClick={() => setActiveStat(stat.id)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                  active
                    ? "border-[#10b981]/60 bg-[#10b981] text-black shadow-[0_0_14px_rgba(16,185,129,0.22)]"
                    : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] hover:border-[#10b981]/35 hover:text-[var(--text)]"
                }`}
              >
                {stat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* CONTROLES */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-[var(--surface)] border border-[#10b981]/20 rounded-2xl p-4 gap-6 shadow-xl shadow-[#10b981]/5">
        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
          <div className="flex bg-[var(--surface-soft)] p-1 rounded-xl border border-[var(--border)] overflow-x-auto max-w-full">
            {SPLIT_SCOPE_OPTIONS.map((scope) => (
              <button
                key={scope.id}
                type="button"
                className={`shrink-0 flex items-center gap-2 px-4 py-2 text-[10px] font-black rounded-lg transition-all ${
                  activeScope === scope.id
                    ? "bg-[#10b981] text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
                onClick={() => setActiveScope(scope.id)}
              >
                {scope.id === "FULL" && <Clock size={12} />}
                {scope.label}
              </button>
            ))}
          </div>

          <div className="bg-gradient-to-b from-transparent via-[#10b981]/40 to-transparent w-[1px] h-10 hidden md:block" />

          <div className="flex bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)]">
            {[30, 20, 10, 5].map((n) => (
              <button
                key={n}
                onClick={() => setLastN(n)}
                className={`flex-1 md:flex-none px-5 py-2.5 rounded-lg text-[10px] font-black transition-all ${
                  lastN === n
                    ? "bg-[var(--brand-soft)] text-[var(--text)] shadow-md border border-[var(--border-strong)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)] border border-transparent"
                }`}
              >
                {`L${n}`}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-6 md:gap-8 w-full md:w-auto justify-between md:justify-end">
          <div className="flex flex-col items-start md:items-end">
            <span className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-[0.2em] flex items-center gap-1 mb-1">
              <Sparkles size={10} className="text-[#10b981]" />
              {isFullScope && selectedStakeOdd ? "Línea Stake" : "Línea manual"}
            </span>
            <div className="flex items-center bg-[var(--bg)] px-2 py-1 rounded-lg border border-[var(--border)]">
              <Target size={14} className="text-red-500 ml-2" />
              <button
                onClick={() =>
                  setLineValue((prev) => adjustLine(prev, -1, activeStat))
                }
                className="px-3 text-[var(--text-muted)] hover:text-[var(--text)] font-black text-xl transition-colors select-none"
              >
                -
              </button>
              <input
                type="number"
                step={lineInputStep}
                value={formatLineValue(lineValue, activeStat)}
                onChange={(e) => setLineValue(parseFloat(e.target.value) || 0)}
                onBlur={() =>
                  setLineValue((prev) => normalizeLineForStat(prev, activeStat))
                }
                className="bg-transparent border-none text-2xl font-black w-16 text-center focus:outline-none text-[var(--text)] p-0 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                onClick={() =>
                  setLineValue((prev) => adjustLine(prev, 1, activeStat))
                }
                className="px-3 text-[var(--text-muted)] hover:text-[var(--text)] font-black text-xl transition-colors select-none"
              >
                +
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-b from-transparent via-[#10b981]/40 to-transparent w-[1px] h-10 hidden md:block" />

          <div className="flex flex-col items-end min-w-[70px]">
            <span className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-[0.2em] mb-1">
              AVG: {avgValue}
              {activeStat === "usage_pct" ? "%" : ""}
            </span>
            <span
              className={`text-3xl font-black tabular-nums leading-none ${hitRateNumber >= 50 ? "text-[#10b981]" : "text-red-500"}`}
            >
              {hitRate}%
            </span>
          </div>
        </div>
      </div>

      {/* SHARE BUTTON */}
      <div className="flex justify-end">
        <ShareButton onShare={shareCurrentAnalysisUrl} />
      </div>

      {/* FILTROS ACTIVOS — internos (sliders) + externos (W/O) en un solo lugar */}
      <StatFilters
        filters={[...activeFilters, ...externalFilters]}
        totalGames={processedStats.slice(0, lastN).length}
        filteredGames={visibleStats.length}
        onRemove={(id) => {
          // internal filter
          removeFilter(id);
          // external filter (W/O from injury panel)
          onRemoveExternalFilter?.(id);
        }}
        onClearAll={() => {
          clearAllFilters();
          externalFilters.forEach((f) => onRemoveExternalFilter?.(f.id));
        }}
      />

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_330px] gap-4 items-start">
        {/* FILTROS GLOBALES — panel lateral limpio */}
        <div className="2xl:order-2 2xl:sticky 2xl:top-4 rounded-[1.5rem] border border-[#10b981]/20 bg-[var(--surface)] p-3 shadow-xl shadow-[#10b981]/5 overflow-hidden">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 rounded-xl border border-[#10b981]/25 bg-[#10b981]/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[#10b981]">
                <History size={12} /> Filtros
              </span>
              <button
                type="button"
                onClick={resetMainFilters}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                Reset
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-[#10b981]/25 bg-[#10b981]/10 px-2 py-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-[#10b981]">
                  Muestra
                </p>
                <p className="mt-1 text-xs font-black text-[var(--text)]">
                  {windowLabel}
                </p>
              </div>
              <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-2 py-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-cyan-300">
                  Partidos
                </p>
                <p className="mt-1 text-xs font-black text-[var(--text)]">
                  {metricStats.length}
                </p>
              </div>
              <div className="rounded-xl border border-orange-400/25 bg-orange-400/10 px-2 py-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-orange-300">
                  HR
                </p>
                <p className="mt-1 text-xs font-black text-[var(--text)]">
                  {hitRate}%
                </p>
              </div>
            </div>

            {hasActiveInjuryContext && (
              <ActiveInjuryContextCard
                rows={activeInjuryRows}
                playerId={playerId}
                gameDate={effectiveInjuryContextDate}
                activeWoTeammate={activeWoTeammate}
                onApplyWo={(row) =>
                  setActiveWoTeammate(
                    String(row?.absent_teammate || "").trim() || null,
                  )
                }
                onClearWo={() => setActiveWoTeammate(null)}
              />
            )}

            {isHistoricalChartMode && (
              <>
                <div>
                  <p className="mb-1.5 text-[8px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">
                    Lado
                  </p>
                  <div className="grid grid-cols-2 gap-1 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-1">
                    <button
                      type="button"
                      onClick={() => setChartSide("over")}
                      className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${chartSide === "over" ? "bg-[#10b981] text-black shadow-[0_0_14px_rgba(16,185,129,0.25)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                    >
                      Over
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartSide("under")}
                      className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${chartSide === "under" ? "bg-red-500 text-white shadow-[0_0_14px_rgba(239,68,68,0.25)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                    >
                      Under
                    </button>
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[8px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">
                    Cancha
                  </p>
                  <div className="grid grid-cols-3 gap-1 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-1">
                    <button
                      type="button"
                      onClick={() => setChartHomeAway(null)}
                      className={`rounded-xl px-2 py-2 text-[9px] font-black uppercase tracking-widest transition-all ${chartHomeAway === null ? "bg-purple-400 text-black" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartHomeAway("HOME")}
                      className={`rounded-xl px-2 py-2 text-[9px] font-black uppercase tracking-widest transition-all ${chartHomeAway === "HOME" ? "bg-purple-400 text-black" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                    >
                      Local
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartHomeAway("AWAY")}
                      className={`rounded-xl px-2 py-2 text-[9px] font-black uppercase tracking-widest transition-all ${chartHomeAway === "AWAY" ? "bg-purple-400 text-black" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                    >
                      Visit.
                    </button>
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-cyan-400/20 bg-cyan-400/[0.035] p-3 min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-[0.22em] text-cyan-300">
                        Minutos
                      </p>
                      <p className="mt-0.5 text-sm font-black uppercase tracking-tight text-[var(--text)]">
                        {chartHistMinMinutes
                          ? `MIN ≥ ${chartHistMinMinutes}`
                          : "Todos"}
                      </p>
                    </div>
                    {chartHistMinMinutes && (
                      <button
                        type="button"
                        onClick={() => setChartHistMinMinutes(null)}
                        className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-cyan-300"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={48}
                    step={1}
                    value={minSliderValue}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setChartHistMinMinutes(next <= 0 ? null : next);
                    }}
                    className="mp-range w-full h-3 appearance-none rounded-full text-cyan-300"
                    style={{
                      background: `linear-gradient(90deg, #22d3ee 0%, #10b981 ${minSliderProgress}%, rgba(148,163,184,0.22) ${minSliderProgress}%, rgba(148,163,184,0.22) 100%)`,
                    }}
                  />
                  <div className="mt-3 grid grid-cols-6 gap-1 text-[8px] font-black uppercase tracking-widest">
                    {[0, 20, 25, 30, 35, 40].map((m) => (
                      <button
                        key={`quick-min-${m}`}
                        type="button"
                        onClick={() =>
                          setChartHistMinMinutes(m === 0 ? null : m)
                        }
                        className={`rounded-lg border px-1.5 py-2 transition-all ${minSliderValue === m ? "border-cyan-300 bg-cyan-300 text-black" : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                      >
                        {m === 0 ? "Todos" : m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-[#10b981]/20 bg-[#10b981]/[0.035] p-3 min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#10b981]">
                        Rival
                      </p>
                      <p className="mt-0.5 truncate text-sm font-black uppercase tracking-tight text-[var(--text)]">
                        {selectedOpponentTeam
                          ? selectedOpponentTeam.short
                          : chartOpponent
                            ? chartOpponent
                            : "Todos"}
                      </p>
                    </div>
                    {(chartOpponent || chartOpponentInput) && (
                      <button
                        type="button"
                        onClick={() => {
                          setChartOpponent("");
                          setChartOpponentInput("");
                        }}
                        className="rounded-lg border border-[#10b981]/20 bg-[#10b981]/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-[#10b981]"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>

                  <form
                    className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const team = findTeamByQuery(chartOpponentInput);
                      setChartOpponent(
                        team?.abbr || chartOpponentInput.trim().toUpperCase(),
                      );
                      if (team) setChartOpponentInput(team.name);
                    }}
                  >
                    <Search size={13} className="text-[var(--text-muted)]" />
                    <input
                      value={chartOpponentInput}
                      onChange={(e) => setChartOpponentInput(e.target.value)}
                      placeholder="OKC, Thunder..."
                      className="min-w-0 flex-1 bg-transparent text-[10px] font-black uppercase tracking-widest text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-[#10b981] px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest text-black"
                    >
                      OK
                    </button>
                  </form>

                  {chartOpponentInput.trim().length > 0 && (
                    <div className="mp-neon-scroll mt-3 max-h-[92px] overflow-auto pr-1">
                      <div className="grid grid-cols-2 gap-2">
                        {opponentSuggestions.slice(0, 6).map((team) => {
                          const active = chartOpponent === team.abbr;
                          return (
                            <button
                              key={team.abbr}
                              type="button"
                              onClick={() => {
                                setChartOpponent(team.abbr);
                                setChartOpponentInput(team.name);
                              }}
                              className={`rounded-xl border px-3 py-2 text-left transition-all ${active ? "border-[#10b981] bg-[#10b981] text-black" : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] hover:border-[#10b981]/35 hover:text-[var(--text)]"}`}
                            >
                              <span className="block text-[10px] font-black uppercase tracking-widest">
                                {team.abbr}
                              </span>
                              <span className="block truncate text-[8px] font-bold uppercase tracking-widest opacity-80">
                                {team.short}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                  {historicalChartLoading && (
                    <span className="inline-flex items-center gap-1 text-cyan-300">
                      <Loader2 size={11} className="animate-spin" /> Histórico
                    </span>
                  )}
                  {!historicalChartLoading && historicalChartData?.summary && (
                    <>
                      <span className="rounded-lg border border-[#10b981]/25 bg-[#10b981]/10 px-2 py-1 text-[#10b981]">
                        {historicalChartData.summary.hits}/
                        {historicalChartData.summary.games}
                      </span>
                      <span className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-cyan-300">
                        HR{" "}
                        {Number(
                          historicalChartData.summary.hitRatePct ?? 0,
                        ).toFixed(1)}
                        %
                      </span>
                      <span className="rounded-lg border border-orange-400/25 bg-orange-400/10 px-2 py-1 text-orange-300">
                        AVG {historicalChartData.summary.avg ?? "S/D"}
                      </span>
                      {chartOpponent && (
                        <span className="rounded-lg border border-[#10b981]/25 bg-[#10b981]/10 px-2 py-1 text-[#10b981]">
                          VS {selectedOpponentTeam?.short || chartOpponent}
                        </span>
                      )}
                      {chartHomeAway && (
                        <span className="rounded-lg border border-purple-400/25 bg-purple-400/10 px-2 py-1 text-purple-300">
                          {chartHomeAway === "HOME" ? "LOCAL" : "VISITANTE"}
                        </span>
                      )}
                      {chartHistMinMinutes && (
                        <span className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-cyan-300">
                          MIN ≥ {chartHistMinMinutes}
                        </span>
                      )}
                      {activeWoTeammate && (
                        <span className="rounded-lg border border-purple-400/25 bg-purple-400/10 px-2 py-1 text-purple-300">
                          W/O {activeWoTeammate}
                        </span>
                      )}
                    </>
                  )}
                  {historicalChartError && (
                    <span className="text-red-300">{historicalChartError}</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* GRÁFICA PRINCIPAL + ODDS COMPACTAS */}
        <div className="2xl:order-1 min-w-0">
          <div className="bg-[var(--surface)] p-4 md:p-5 rounded-[2rem] border border-[#10b981]/25 shadow-2xl shadow-[#10b981]/5 relative min-w-0 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#10b981] to-transparent" />

            <div className="mb-3 flex flex-wrap items-center gap-2">
              {!isFullScope && (
                <span className="rounded-xl border border-[#10b981]/30 bg-[#10b981]/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-[#10b981]">
                  {activeScopeOption.badgeLabel}
                </span>
              )}
              {activeFilters.length + externalFilters.length > 0 && (
                <span className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-orange-400">
                  {chartStats.length} partidos filtrados
                </span>
              )}
              {selectedStakeOdds.length > 0 && (
                <span className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-cyan-300">
                  Líneas Stake en panel izquierdo · {selectedStakeOdds.length}
                </span>
              )}
            </div>

            <div className="min-h-[470px] w-full relative">
              {isHistoricalChartMode && historicalChartLoading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-black/45 backdrop-blur-sm">
                  <div className="flex items-center gap-2 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-cyan-300">
                    <Loader2 size={16} className="animate-spin" /> Cargando
                    histórico
                  </div>
                </div>
              )}
              <PlayerChart
                data={chartStats}
                statKey="value"
                lineValue={lineValue}
                side={isHistoricalChartMode ? chartSide : "over"}
                overlayKey={opportunityOverlay?.key}
                overlayLabel={opportunityOverlay?.label}
                overlayColor={opportunityOverlay?.color}
                overlayRatioLabel={opportunityOverlay?.ratioLabel}
              />
            </div>
          </div>
        </div>
      </div>

      {/* CONTEXTO RÁPIDO */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--surface)] border border-[#10b981]/25 rounded-2xl p-4 shadow-xl shadow-[#10b981]/5 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-[#10b981]" />
          <p className="text-[8px] text-[#10b981] font-black uppercase tracking-widest">
            Hit Rate
          </p>
          <p
            className={`text-2xl font-black ${hitRateNumber >= 50 ? "text-[#10b981]" : "text-red-500"}`}
          >
            {hits}/{metricStats.length}
          </p>
          <p className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-1">
            {trendLabel}
          </p>
        </div>

        <div className="bg-[var(--surface)] border border-cyan-400/25 rounded-2xl p-4 shadow-xl shadow-cyan-400/5 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-cyan-400" />
          <p className="text-[8px] text-cyan-300 font-black uppercase tracking-widest">
            Min Prom.
          </p>
          <p className="text-2xl font-black text-[var(--text)] tabular-nums">
            {avgMinutes}
          </p>
          <p className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-1">
            {volumeLabel}
          </p>
        </div>

        <div className="bg-[var(--surface)] border border-orange-400/25 rounded-2xl p-4 shadow-xl shadow-orange-400/5 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-orange-400" />
          <p className="text-[8px] text-orange-300 font-black uppercase tracking-widest">
            Línea
          </p>
          <p className="text-2xl font-black text-[var(--text)] tabular-nums">
            {formatLineValue(lineValue, activeStat)}
          </p>
          <p className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-1">
            {activeStatLabel}
          </p>
        </div>

        <div
          className={`bg-[var(--surface)] border rounded-2xl p-4 shadow-xl relative overflow-hidden ${lowMinuteGames > 0 ? "border-yellow-400/30 shadow-yellow-400/5" : "border-[#10b981]/25 shadow-[#10b981]/5"}`}
        >
          <div
            className={`absolute inset-x-0 top-0 h-[2px] ${lowMinuteGames > 0 ? "bg-yellow-400" : "bg-[#10b981]"}`}
          />
          <p
            className={`text-[8px] font-black uppercase tracking-widest ${lowMinuteGames > 0 ? "text-yellow-300" : "text-[#10b981]"}`}
          >
            Alerta
          </p>
          <p className="text-sm font-black text-[#10b981] uppercase flex items-center gap-2">
            <Gauge size={14} />{" "}
            {lowMinuteGames > 0
              ? `${lowMinuteGames} baja min.`
              : "Muestra limpia"}
          </p>
          <p className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-2 flex items-center gap-1">
            <TrendingUp size={10} /> {windowLabel}
            {activeFilters.length + externalFilters.length > 0 && (
              <span className="text-orange-400 ml-1">
                · {activeFilters.length + externalFilters.length} filtro
                {activeFilters.length + externalFilters.length > 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* PICK INSIGHT PANEL */}
      <PickInsightPanel
        stats={visibleStats}
        lineValue={lineValue}
        activeStatLabel={activeStatLabel}
        hitRate={hitRateNumber}
        hits={hits}
        avgValue={avgValue}
        avgMinutes={avgMinutes}
        lastN={metricStats.length}
      />

      {/* SUPPORTING DATA GRID — now with sliders + hide toggle */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <p className="text-[9px] text-cyan-300 font-black uppercase tracking-widest flex items-center gap-2">
            <LayoutList size={12} className="text-[#10b981]" />
            Supporting Data · color por tipo
          </p>
          <button
            type="button"
            onClick={() => setShowSupportingData((p) => !p)}
            className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text)] transition-colors border border-[var(--border)] px-2.5 py-1 rounded-lg"
          >
            {showSupportingData ? "Ocultar" : "Mostrar"}
          </button>
        </div>

        {showSupportingData && (
          <SupportingDataGrid
            stats={supportingStats}
            activeStat={activeStat}
            activeStatLabel={activeStatLabel}
            onFilterChange={handleMetricFilter}
            correlatedMetric={correlatedMetric}
            resetToken={filterResetCount}
          />
        )}
      </div>

      {/* EXPLORADOR HISTÓRICO — separado de la data actual para evitar timeouts y no romper Q1/H1/H2 */}
      <PlayerHistoricalExplorer
        playerId={playerId}
        playerName={playerName || ""}
        activeStat={activeStat}
        activeStatLabel={activeStatLabel}
        lineValue={lineValue}
        side={chartSide}
        minMinutes={chartHistMinMinutes}
        opponent={chartOpponent || null}
        homeAway={chartHomeAway}
        woTeammate={activeWoTeammate}
        externalFilterCount={externalFilters.length}
      />

      {/* GAME LOG — sortable, extracted component */}
      <GameLogTable
        stats={visibleStats}
        lineValue={lineValue}
        activeStatLabel={activeStatLabel}
        activeScopeLabel={activeScopeOption.label}
        activeStat={activeStat}
        formatLine={(v) => formatLineValue(v, activeStat)}
      />
    </div>
  );
}
