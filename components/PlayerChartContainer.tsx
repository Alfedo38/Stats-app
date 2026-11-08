"use client";
import RotationPilot from "@/components/RotationPilot";
import SelectionLegend from './SelectionLegend';
import PlayerSelectionBar from "@/components/PlayerSelectionBar";
import PlayerSampleSummary from "@/components/PlayerSampleSummary";
import PlayerLineExplorer from "@/components/PlayerLineExplorer";
import {playerMarketLabel} from "@/lib/playerPresentation";


import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import {gamePhase} from "@/lib/nbaGameFilters";
import {historySeasons,twoSeasonRows} from "@/lib/nbaHistoryWindow";
import {secondaryAxis} from "@/lib/playerRecentChange";
import { useSearchParams } from "next/navigation";
import {
  getMinutesValue,
  getOpponent,
  getGameLocation,
  formatDateShort,
} from "@/lib/playerUtils";
import {quotesForEvent} from "@/lib/playerEvent";
import {usePlayerEvent} from "@/hooks/usePlayerEvent";
import PlayerEventControl from "@/components/PlayerEventControl";
import AddSelectionToAnalyzer from "@/components/AddSelectionToAnalyzer";
import DefenseContextCard from "@/components/DefenseContextCard";
import {usePlayerDefense} from "@/hooks/usePlayerDefense";
import {DEFENSE_BANDS,defenseUrlChoice} from "@/lib/nbaDefense";
import {parseGameContext,putGameContext} from "@/lib/playerNavigation";
import { useAnalysisQuery } from "@/hooks/useAnalysisQuery";
import { finiteStat, selectionSummary } from "@/lib/selectionStats";
import { buildPeriodRows, periodMetricValue } from "@/lib/nbaPeriodStats";
import { sampleCoverage, type AnalysisSample } from "@/lib/nbaAnalysis";
import PlayerChart from "@/components/PlayerChart";
import PlayerChangeCard from "@/components/PlayerChangeCard";
import PlayerSecondaryControl from "@/components/PlayerSecondaryControl";
import AlternativeLines from "@/components/AlternativeLines";
import PlayerSupportingStats from "@/components/PlayerSupportingStats";
import {parseSecondary,selectedSecondary,validSecondaryChoice,secondaryValue,type SecondaryChoice} from "@/lib/playerRecentChange";
import SupportingDataGrid from "@/components/SupportingDataGrid";
import PickInsightPanel from "@/components/PickInsightPanel";
import PlayerHistoricalExplorer from "@/components/PlayerHistoricalExplorer";
import {nbaHistoryCutoff} from "@/lib/injuryReport";
import {comparisonMarket} from "@/lib/absenceComparison";
import {argentinaDate,isDate} from "@/lib/ticketReader/model";
import {cleanPageSample,sampleGameKey} from '@/lib/playerSample';
import StatFilters, { type ActiveFilter } from "@/components/StatFilters";
import GameLogTable from "@/components/GameLogTable";
import FloatingPlayerIdentity, {ChartIdentity} from "@/components/PlayerIdentity";
import PlayerAbsenceFilter from "@/components/PlayerAbsenceFilter";
import {absenceScope as parseAbsenceScope,absenceTeam as parseAbsenceTeam,absenceEmptyMessage,type AbsenceScope} from "@/lib/playerAbsenceContext";
import {parsePhase,phaseRows,absenceRows,cleanAbsences,PHASE_OPTIONS,type NBASeasonPhase} from "@/lib/nbaGameFilters";
import PlayerOddsComparison from "@/components/PlayerOddsComparison";
import {decimalPrice,oddsBook,quoteMatches,type PriceQuote} from "@/lib/nbaOdds";
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

type StakePlayerOdd = PriceQuote;

interface PlayerChartContainerProps {
  analyzerStorageKey?:string;
  stats: any[];
  navStats: { id: string; label: string }[];
  playerName?: string;
  playerPosition?: string;
  playerTeam?: string|null;
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
  analysisMode?: "simple" | "pro";
  detailTab?: "summary"|"volume"|"opponent"|"shots";
  compact?:boolean;
  detailNavigation?:ReactNode;
  onAnalysisSampleChange?: (sample: AnalysisSample) => void;
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
  const value = periodMetricValue(s, statId, scope);
  return value === null ? (scope === "FULL" ? 0 : Number.NaN) : value;
}

function getStatValue(s:any,statId:string,scope:SplitScope):number {
  return periodMetricValue(s,statId,scope)??NaN;
}
function getScopedMinutesRaw(raw:any,scope:SplitScope) { return scope==='FULL'?null:getMinutesValue(raw); }

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
    ftm: "FTM",
    fta: "FTA",
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

function normalizeGameIdKey(value: any): string {
  if (value === null || value === undefined || value === "") return "";
  const raw = String(value).trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return digits.replace(/^0+/, "") || "0";
}

function splitPrefixForScope(scope: SplitScope): "q1" | "h1" | "h2" | null {
  if (scope === "Q1") return "q1";
  if (scope === "H1") return "h1";
  if (scope === "H2_REG") return "h2";
  return null;
}

function numberOrZero(value: any): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
  playerPosition,
  playerTeam,
  playerId,
  stakeOdds = [],
  filterTeams,
  opponent,
  homeAway,
  asOfDate,
  analyzerStorageKey,
  externalFilters = [],
  onRemoveExternalFilter,
  activeInjuryContext = [],
  analysisMode = "pro",
  detailTab="summary",detailNavigation,compact=false,
  onAnalysisSampleChange,
}: PlayerChartContainerProps) {
  const searchParams = useSearchParams();
  const linkedContext=useMemo(()=>parseGameContext(searchParams),[searchParams]);
  const [rotationOpen,setRotationOpen]=useState(false);
  const historyFilters=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const openFilters=(event:Event)=>{
      const detail=(event as CustomEvent).detail;
      if(String(detail?.playerId)!==String(playerId)||!historyFilters.current)return;
      historyFilters.current.open=true;
      historyFilters.current.scrollIntoView({block:'nearest'});
    };
    window.addEventListener('nba-compare-teammate',openFilters);
    return ()=>window.removeEventListener('nba-compare-teammate',openFilters);
  },[playerId]);
  const pageEvent=usePlayerEvent({playerId,team:playerTeam,initialContext:linkedContext,referenceDate:asOfDate});
  const gameContext=pageEvent.context;
  const eventDate=gameContext?.date??(isDate(pageEvent.date)?pageEvent.date:asOfDate??argentinaDate());
  const historyCutoff=gameContext?nbaHistoryCutoff(gameContext):pageEvent.mode==='day'||isDate(asOfDate)?pageEvent.date:null;
  const [selectedBook,setSelectedBook]=useState<string|null>(()=>oddsBook(searchParams.get("book")));
  const [oddsRetry,setOddsRetry]=useState(0);

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
    defaultN: 20,
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
    cleanOpponentParam(searchParams.get("opponent") || ""),
  );
  const [chartOpponent, setChartOpponentState] = useState(() =>
    cleanOpponentParam(searchParams.get("opponent") || ""),
  );
  const [chartHomeAway, setChartHomeAwayState] = useState<
    "HOME" | "AWAY" | null
  >(() => readHomeAway(searchParams.get("homeAway")));
  const [activeWoTeammate, setActiveWoTeammateState] = useState<string | null>(
    () => cleanWoParam(searchParams.get("wo")),
  );
  const [seasonPhase, setSeasonPhase] = useState<NBASeasonPhase>(()=>parsePhase(searchParams.get("phase")));
  const [absentNames, setAbsentNames] = useState<string[]>(()=>cleanAbsences(searchParams.getAll("absent")));
  const effectiveAbsences = useMemo(()=>cleanAbsences([...absentNames,...(activeWoTeammate?[activeWoTeammate]:[])]),[absentNames,activeWoTeammate]);
  // absence-roster-v1
  // absence-roster-v2
  const [absenceMode,setAbsenceMode]=useState<AbsenceScope>(()=>parseAbsenceScope(searchParams.get("absenceScope"),searchParams.getAll("absent").length>0||!!searchParams.get("wo")));
  const [absenceTeamFilter,setAbsenceTeamFilter]=useState(()=>parseAbsenceScope(searchParams.get("absenceScope"),searchParams.getAll("absent").length>0||!!searchParams.get("wo"))==='historical'?parseAbsenceTeam(searchParams.get("absenceTeam")):'');
  const changeAbsenceMode=useCallback((next:AbsenceScope)=>{setAbsenceMode(next);setAbsenceTeamFilter('');setAbsentNames([]);setActiveWoTeammateState(null);},[]);
  const changeAbsenceTeam=useCallback((next:string)=>{setAbsenceTeamFilter(parseAbsenceTeam(next));setAbsentNames([]);setActiveWoTeammateState(null);},[]);
  const absenceKey = JSON.stringify(effectiveAbsences);
  const absenceContextKey = `${playerId}:${absenceMode}:${absenceTeamFilter}:${absenceKey}`;
  const [absenceState, setAbsenceState] = useState<{key:string;matches:Record<string,string[]>|null;loading:boolean;error:string|null}>({key:'',matches:null,loading:false,error:null});
  const [absenceRetry,setAbsenceRetry] = useState(0);
  const [secondaryChoice,setSecondaryChoice]=useState<SecondaryChoice>(()=>parseSecondary(searchParams.get("compare")));
  const currentAbsence = absenceState.key === absenceContextKey ? absenceState : {matches:null,loading:effectiveAbsences.length>0,error:null};
  const changeAbsences = useCallback((names:string[])=>{setAbsentNames(cleanAbsences(names));setActiveWoTeammateState(null);},[]);
  useEffect(()=>{
    if(!effectiveAbsences.length){setAbsenceState({key:absenceContextKey,matches:{},loading:false,error:null});return;}
    const controller=new AbortController();
    setAbsenceState({key:absenceContextKey,matches:null,loading:true,error:null});
    fetch('/api/player-absence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId,names:effectiveAbsences,scope:absenceMode,team:absenceTeamFilter}),signal:controller.signal,cache:'no-store'})
      .then(async response=>{const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'No se pudieron consultar las ausencias.');if(!controller.signal.aborted)setAbsenceState({key:absenceContextKey,matches:data.matches??{},loading:false,error:null});})
      .catch(error=>{if(!controller.signal.aborted)setAbsenceState({key:absenceContextKey,matches:null,loading:false,error:error.message});});
    return()=>controller.abort();
  },[playerId,absenceContextKey,absenceRetry]);
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

  const defenseOpponent=chartOpponent||pageEvent.opponent||(!pageEvent.selectedByUser?opponent:null)||"";
  const defense=usePlayerDefense({initial:defenseUrlChoice(searchParams),playerId:String(playerId||''),position:playerPosition,opponent:defenseOpponent,market:activeStat,asOfDate:historyCutoff??eventDate,phase:seasonPhase,scope:activeScope});

  // DVP vive fuera de este componente, pero el rival real lo controla este panel.
  // Avisamos al parent cada vez que cambia para evitar que DVP quede congelado
  // con el rival anterior o con el próximo partido equivocado.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const effectiveOpponent = cleanOpponentParam(defenseOpponent);
    window.dispatchEvent(
      new CustomEvent("player-dvp-context-change", {
        detail: {
          playerId: String(playerId || ""),
          opponent: effectiveOpponent || null,
          eventOpponent: pageEvent.opponent || null,
          historyOpponent: chartOpponent || null,
          cutoffDate: historyCutoff ?? eventDate,
          hasOpponentFilter: Boolean(chartOpponent),
          eventDate,context:gameContext,
        },
      }),
    );
  }, [playerId, chartOpponent, defenseOpponent,eventDate,gameContext,pageEvent.opponent,historyCutoff]);

  const resetMainFilters = useCallback(() => {
    setActiveFilters([]);
    setLastN(20);
    externalFilters.forEach(f=>onRemoveExternalFilter?.(f.id));
    setFilterResetCount((count) => count + 1);
    setChartHistMinMinutesState(null);
    setChartOpponentState("");
    setChartOpponentInput("");
    setChartHomeAwayState(null);
    setActiveWoTeammateState(null);
    setAbsentNames([]);
    setAbsenceMode("current");setAbsenceTeamFilter("");
    setSeasonPhase("ALL");
    defense.setBand("all");
  }, [defense.setBand,setLastN,externalFilters,onRemoveExternalFilter]);

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
    return; // no autoaplicar rival por defecto; solo URL explícita
    const nextOpponent = String(opponent || "").toUpperCase();
    setChartOpponentInput(nextOpponent);
    setChartOpponentState(nextOpponent);
  }, [opponent, searchParams]);




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
  const effectiveSecondaryChoice=validSecondaryChoice(activeStat,secondaryChoice);
  const changeSecondary=setSecondaryChoice;
  const opportunityOverlay = useMemo(
    () => compact?null:selectedSecondary(activeStat, effectiveSecondaryChoice, activeScope),
    [compact, activeStat, effectiveSecondaryChoice, activeScope],
  );
  const historicalMarket = useMemo(
    () => getStakePropType(activeStat),
    [activeStat],
  );
  const isHistoricalChartMode = isFullScope && Boolean(historicalMarket);
  const windowLabel = `L${lastN}`;

  const historyQuery=useAnalysisQuery(isHistoricalChartMode&&!pageEvent.loading&&historicalMarket&&playerName&&Number.isFinite(Number(lineValue))?'/api/player-history':null,{
    playerId,playerName,market:historicalMarket,line:Number(lineValue),side:chartSide,mode:'last2',
    opponent:chartOpponent||null,homeAway:chartHomeAway,minMinutes:chartHistMinMinutes,woTeammate:null,phase:seasonPhase,limit:1000,asOfDate:historyCutoff,
  });
  const historicalChartData=historyQuery.data;
  const historicalChartLoading=historyQuery.loading;
  const historicalChartError=historyQuery.error;
  const numericPlayerId=Number(playerId);
  const periodsQuery=useAnalysisQuery(Number.isSafeInteger(numericPlayerId)&&numericPlayerId>0?`/api/player-period-splits?playerId=${encodeURIComponent(String(numericPlayerId))}&limit=3000`:null);
  const periodSplitRows=useMemo(()=>Array.isArray(periodsQuery.data?.rows)?periodsQuery.data.rows:[],[periodsQuery.data]);
  const periodLoading=periodsQuery.loading;
  const periodError=periodsQuery.error;
  const oddsQuery=useAnalysisQuery(playerName?`/api/player-odds?playerName=${encodeURIComponent(playerName)}&playerId=${encodeURIComponent(String(playerId??''))}&retry=${oddsRetry}`:null);
  const liveOdds:PriceQuote[]=useMemo(()=>Array.isArray(oddsQuery.data?.odds)?oddsQuery.data.odds:[],[oddsQuery.data]);
  const oddsLoading=oddsQuery.loading,oddsError=oddsQuery.error;
  const oddsRequestKey=`${playerId}:${playerName}`;
  const oddsResolvedFor=oddsLoading?'':oddsRequestKey;
  const autoLineContext=useRef('');
  const eventOdds=useMemo(()=>quotesForEvent(liveOdds,gameContext),[liveOdds,gameContext]);
  const effectiveOddsEvent=gameContext?`${gameContext.date}:${gameContext.away}-${gameContext.home}`:'unconfirmed';
  const currentPrices=useMemo(()=>eventOdds.filter(q=>quoteMatches(q,activeStat,activeScope)),[eventOdds,activeStat,activeScope]);
  const selectedStakeOdds=useMemo(()=>currentPrices.filter(q=>decimalPrice(q.over_price)!==null||decimalPrice(q.under_price)!==null),[currentPrices]);

  const selectedStakeOdd = useMemo(
    () => pickPrimaryStakeOdd(selectedStakeOdds),
    [selectedStakeOdds],
  );

  const twoSeasonStats=useMemo(()=>twoSeasonRows(stats||[],historyCutoff??eventDate).filter(r=>["Regular Season","Playoffs"].includes(gamePhase(r)??"")),[stats,historyCutoff,eventDate]);

  // ── Raw scoped stats ─────────────────────────────────────────────────────────
  const scopedRawStats = useMemo(
    () => buildPeriodRows(twoSeasonStats.filter(row=>!historyCutoff||String(row.game_date).slice(0,10)<historyCutoff), periodSplitRows.filter((row:any)=>!historyCutoff||String(row.game_date).slice(0,10)<historyCutoff), activeScope, activeStat),
    [twoSeasonStats, periodSplitRows, activeScope, activeStat,historyCutoff],
  );

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
    if (hasLineParam || oddsResolvedFor !== oddsRequestKey) return;
    const context=`${playerId}:${activeStat}:${activeScope}:${effectiveOddsEvent}`;
    if(autoLineContext.current===context)return;

    if (
      selectedStakeOdd?.line != null &&
      Number.isFinite(Number(selectedStakeOdd.line))
    ) {
      autoLineContext.current=context;
      setLineValue(
        normalizeLineForStat(Number(selectedStakeOdd.line), activeStat),
      );
      return;
    }
    if (uniqueStats.length > 0) {
      autoLineContext.current=context;
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
    effectiveOddsEvent,
    oddsResolvedFor,
    oddsRequestKey,
    playerId,
    hasLineParam,
    setLineValue,
  ]);

  // ── Processed stats ───────────────────────────────────────────────────────────
  const processedStats = useMemo(() => {
    return uniqueStats.map((s: any) => {
      const rawValue = getStatValue(s, activeStat, activeScope);
      const safeValue = Number.isFinite(rawValue)
        ? Number(rawValue.toFixed(1))
        : null;

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
  const filteredStatsBeforeWindow = useMemo(() => {
    let result = absenceRows(phaseRows(processedStats,seasonPhase),effectiveAbsences,currentAbsence.matches).slice().reverse();
    if (!isFullScope) {
      if (chartOpponent) result = result.filter(row => getOpponent(row) === chartOpponent);
      if (chartHomeAway) result = result.filter(row => getGameLocation(row) === (chartHomeAway === "HOME" ? "vs" : "@"));
      if (chartHistMinMinutes !== null) result = result.filter(row => { const minutes = finiteStat(row.full_game_minutes)??getMinutesValue(row); return minutes !== null && minutes >= chartHistMinMinutes; });
    }

    const allFilters = [...activeFilters, ...externalFilters];

    for (const filter of allFilters) {
      if (filter.type === "threshold" && filter.value !== undefined) {
        const metricId = filter.id.replace("threshold:", "");

        if (metricId === "minutes") {
          result = result.filter((s) => {
            const m = finiteStat(s.full_game_minutes)??getMinutesValue(s);
            return m !== null && m >= filter.value!;
          });
        } else {
          result = result.filter((s) => {
            const raw = s?.[metricId];
            if (raw === null || raw === undefined) return false;
            const n = Number(raw);
            return Number.isFinite(n) && n >= filter.value!;
          });
        }
      }

      if (filter.type === "wo") {
        const parsed = parseExternalPlayerFilterId(filter.id);
        if (!parsed) continue;

        const teammateGameIds = new Set((externalGameIds[parsed.playerId] || []).map(normalizeGameId));
        if (!Object.prototype.hasOwnProperty.call(externalGameIds, parsed.playerId)) { result = []; continue; }

        result = result.filter((s) => {
          const gameId = normalizeGameId(s.game_id);
          if (!gameId) return false;
          const teammatePlayed = teammateGameIds.has(gameId);
          return parsed.mode === "with" ? teammatePlayed : !teammatePlayed;
        });
      }
    }

    result = defense.apply(result);
    return result;
  }, [defense.report,defense.band,defense.options.position,seasonPhase,absenceKey,currentAbsence.matches,processedStats, lastN, activeFilters, externalFilters, externalGameIds, isFullScope, chartOpponent, chartHomeAway, chartHistMinMinutes, activeWoTeammate]);

  const visibleStats = useMemo(()=>lastN>=999?filteredStatsBeforeWindow:filteredStatsBeforeWindow.slice(-lastN),[filteredStatsBeforeWindow,lastN]);

  const historicalChartStats = useMemo(() => {
    const games = Array.isArray(historicalChartData?.games)
      ? historicalChartData.games
      : [];
    return twoSeasonRows(games,historyCutoff??eventDate)
      .filter(r=>["Regular Season","Playoffs"].includes(gamePhase(r)??""))
      .slice()
      .reverse()
      .map((g: any, index: number) => ({
        ...g,
        id: g.game_id || `${g.game_date || "hist"}-${index}`,
        game_date: g.game_date,
        season_id: g.season_id,
        team_abbreviation: g.team_abbreviation,
        fta: g.fta,
        ftm:g.ftm,oreb:g.oreb,dreb:g.dreb,
        value: finiteStat(g.value),
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
  }, [historicalChartData, lineValue,historyCutoff,eventDate]);

  const historicalSampleRows = useMemo(()=>absenceRows(phaseRows(historicalChartStats,seasonPhase),effectiveAbsences,currentAbsence.matches),[historicalChartStats,seasonPhase,absenceKey,currentAbsence.matches]);
  const historicalChartWindow = historicalSampleRows;

  // Aplicar los mismos filtros locales al histórico y a la muestra Pro.
  const sharedHistoricalBeforeWindow = useMemo(() => {
    let result = historicalChartWindow;
    for (const filter of [...activeFilters, ...externalFilters]) {
      if (filter.type === 'threshold' && filter.value !== undefined) {
        const key = filter.id.replace('threshold:', '');
        result = result.filter((row: any) => {
          const value = key === 'minutes' ? finiteStat(row.full_game_minutes)??getMinutesValue(row) : row[key] == null ? null : Number(row[key]);
          return value !== null && Number.isFinite(value) && value >= filter.value!;
        });
      }
      if (filter.type === 'wo') {
        const parsed = parseExternalPlayerFilterId(filter.id); if (!parsed) continue;
        if (!Object.prototype.hasOwnProperty.call(externalGameIds, parsed.playerId)) { result = []; continue; }
        const played = new Set((externalGameIds[parsed.playerId] || []).map(normalizeGameId));
        result = result.filter((row: any) => parsed.mode === 'with' ? played.has(normalizeGameId(row.game_id)) : !played.has(normalizeGameId(row.game_id)));
      }
    }
    result = defense.apply(result);
    return result;
  }, [defense.report,defense.band,defense.options.position,historicalChartWindow, lastN, activeFilters, externalFilters, externalGameIds]);
  const sharedHistoricalWindow=useMemo(()=>lastN>=999?sharedHistoricalBeforeWindow:sharedHistoricalBeforeWindow.slice(-lastN),[sharedHistoricalBeforeWindow,lastN]);
  const defenseFilterLoading=defense.band!=="all"&&defense.loading;
  const defenseFilterError=defense.band!=="all"&&!defense.loading&&(!defense.report||!defense.canFilter)?"El filtro defensivo no tiene una referencia completa. Quitá el filtro o elegí otra temporada.":null;
  const sampleLoading=pageEvent.loading||defenseFilterLoading||currentAbsence.loading||(isHistoricalChartMode?historicalChartLoading:!isFullScope&&periodLoading);
  const sampleError=defenseFilterError||currentAbsence.error||(isHistoricalChartMode?historicalChartError:!isFullScope?periodError:null);
  const chartStats: any[] = useMemo(()=>sampleLoading||sampleError?[]:isHistoricalChartMode?sharedHistoricalWindow:visibleStats,[sampleLoading,sampleError,isHistoricalChartMode,sharedHistoricalWindow,visibleStats]);
  const metricStats: any[] = chartStats;
  const changeRows=sampleLoading||sampleError?[]:isHistoricalChartMode?sharedHistoricalBeforeWindow:filteredStatsBeforeWindow;
  const changeReferenceRows=useMemo(()=>[...twoSeasonStats,...historicalChartStats],[twoSeasonStats,historicalChartStats]);
  const pageSample=useMemo(()=>{
    if(!/^[1-9]\d{0,12}$/.test(String(playerId))||!isDate(eventDate))return undefined;
    const labels=[historySeasons(historyCutoff??eventDate).join(" + "),seasonPhase==='ALL'?'Regular + playoffs':seasonPhase==='Playoffs'?'Playoffs':'Temporada regular',chartHomeAway==='HOME'?'Solo local':chartHomeAway==='AWAY'?'Solo visitante':'Local y visitante',chartOpponent?`vs ${chartOpponent}`:'Todos los rivales',chartHistMinMinutes!==null?`MIN ≥ ${chartHistMinMinutes}`:'',effectiveAbsences.length?`Sin ${effectiveAbsences.join(', ')}`:'',...activeFilters.map(f=>f.label),...externalFilters.map(f=>f.label),defense.band!=='all'?`Defensa: ${DEFENSE_BANDS[defense.band]}`:''].filter(Boolean).map(x=>x.slice(0,100));
    const exactIds=effectiveAbsences.length>0||activeFilters.length>0||externalFilters.length>0||defense.band!=='all';
    return cleanPageSample({version:1,playerId:String(playerId),eventDate,cutoffDate:historyCutoff??eventDate,scope:activeScope,phase:seasonPhase,seasons:'last2',homeAway:chartHomeAway,opponent:chartOpponent||null,minMinutes:chartHistMinMinutes,labels:labels.slice(0,12),...(exactIds?{gameIds:changeRows.map(row=>sampleGameKey(row.game_id??row.id)).filter(Boolean).slice(0,1000)}:{})});
  },[playerId,eventDate,historyCutoff,activeScope,seasonPhase,chartHomeAway,chartOpponent,chartHistMinMinutes,absenceKey,activeFilters,externalFilters,defense.band,changeRows]);
  const supportingStats = useMemo(
    () => metricStats,
    [metricStats],
  );

  useLayoutEffect(() => {
    if (!onAnalysisSampleChange) return;
    const labels = [PHASE_OPTIONS.find(option=>option.value===seasonPhase)?.label || '', effectiveAbsences.length?`Ausentes: ${effectiveAbsences.join(', ')}`:'', chartOpponent ? `vs ${chartOpponent}` : '', chartHomeAway || '', chartHistMinMinutes !== null ? `MIN ≥ ${chartHistMinMinutes}` : '', activeWoTeammate ? `Ausencia: ${activeWoTeammate}` : '', ...activeFilters.map(f => f.label), ...externalFilters.map(f => f.label)].filter(Boolean);
    if(defense.band!=="all")labels.push(`Defensa: ${DEFENSE_BANDS[defense.band]} · ${defense.options.season}`);
    const hasThreshold = [...activeFilters, ...externalFilters].some(f => f.type === 'threshold' && f.id !== 'threshold:minutes');
    const hasLocalFilters = activeFilters.length > 0 || externalFilters.length > 0;
    onAnalysisSampleChange({
      playerId: String(playerId || ''), rows: metricStats,
      trainingRows: isFullScope && isHistoricalChartMode && !hasLocalFilters ? historicalSampleRows : metricStats,
      scope: activeScope, phase: seasonPhase, market: activeStat, line: Number(lineValue), opponent: chartOpponent || null,
      homeAway: chartHomeAway, minMinutes: chartHistMinMinutes, labels,
      outcomeFiltered: defense.band!=="all" || hasThreshold || (isFullScope && hasLocalFilters && isHistoricalChartMode),
      coverage: sampleCoverage(phaseRows(twoSeasonStats,seasonPhase),phaseRows(scopedRawStats,seasonPhase)),
      loading: pageEvent.loading || defenseFilterLoading || currentAbsence.loading || (isFullScope ? Boolean(historicalChartLoading && isHistoricalChartMode) : periodLoading),
      error: defenseFilterError || currentAbsence.error || (isFullScope && isHistoricalChartMode ? historicalChartError : !isFullScope ? periodError : null),
    });
  }, [pageEvent.loading,defense.band,defense.options.season,defenseFilterLoading,defenseFilterError,onAnalysisSampleChange, playerId, metricStats, activeScope, activeStat, lineValue, chartOpponent, chartHomeAway, chartHistMinMinutes, activeWoTeammate, activeFilters, externalFilters, isFullScope, isHistoricalChartMode, historicalChartStats, stats, scopedRawStats, historicalChartLoading, historicalChartError, periodLoading, periodError, seasonPhase, absenceKey, currentAbsence.loading, currentAbsence.error, historicalSampleRows]);

  // ── Derived metrics ───────────────────────────────────────────────────────────
  const selection=selectionSummary(metricStats.map(row=>row.value),lineValue,chartSide);
  const avgValue=selection.average===null?'S/D':selection.average.toFixed(1);
  const availableComparison = isFullScope && isHistoricalChartMode ? historicalSampleRows : absenceRows(phaseRows(processedStats,seasonPhase),effectiveAbsences,currentAbsence.matches);
  const currentSampleLabel=`${windowLabel} · ${metricStats.length} PJ`;
  const baseSampleLabel=`${isHistoricalChartMode?"Histórico":"Base disponible"} · ${availableComparison.length} PJ`;
  const seasonAvgValue=selectionSummary(availableComparison.map(row=>row.value),lineValue,chartSide).average;
  const filteredAvgValue=selection.average;
  const lineDifference=filteredAvgValue===null?null:filteredAvgValue-Number(lineValue);
  // -1 is a display-only sentinel; the shared summary retains null, never 0% for no sample.
  const hits=selection.hits;
  const hitRateNumber=selection.rate===null?-1:Math.round(selection.rate);
  const hitRate=selection.rate===null?'S/D':String(hitRateNumber);

  const minutesValues = metricStats
    .map((s) => getMinutesValue(s))
    .filter((m): m is number => m !== null);
  const avgMinutes =
    minutesValues.length > 0
      ? (
          minutesValues.reduce((sum, m) => sum + m, 0) / minutesValues.length
        ).toFixed(1)
      : "S/D";

  const lowMinuteGames = isFullScope?minutesValues.filter((m) => m < 20).length:0;

  const trendLabel =
    sampleLoading ? "Cargando muestra" : selection.rate===null ? "Sin muestra para evaluar" : hitRateNumber >= 60
      ? "Mayoría de aciertos históricos"
      : hitRateNumber >= 50
        ? "Tendencia media"
        : "Tendencia baja";

  const volumeLabel =
    avgMinutes === "S/D"
      ? "Sin minutos"
      : Number(avgMinutes) >= 30
        ? "30 minutos o más"
        : Number(avgMinutes) >= 24
          ? "24 a 30 minutos"
          : "Menos de 24 minutos";

  const lineInputStep = usesIntegerLine(activeStat) ? "1" : "any";

  // ── Supporting metric más correlacionada con la prop activa ───────────────────
  const correlatedMetric = useMemo(() => {
    let bestMetric = "minutes";
    let bestScore = 0;

    for (const metricId of SUPPORTING_CORRELATION_METRICS) {
      if (metricId === activeStat) continue;

      const xs: number[] = [];
      const ys: number[] = [];
      for (const row of metricStats) {
        const metricValue = getMetricValueForCorrelation(row, metricId);
        const targetValue = finiteStat(row.value);
        if (metricValue === null || targetValue===null) continue;
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
  }, [activeStat, metricStats]);

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

  // ─────────────────────────────────────────────────────────────────────────────

  const shareCurrentAnalysisUrl = useCallback(async (): Promise<boolean> => {
    try {
      const params = new URLSearchParams();
      putGameContext(params,gameContext);
      params.set("stat", activeStat);
      params.set("line", String(lineValue));
      params.set("n", String(lastN));
      if(effectiveSecondaryChoice!=="auto")params.set("compare",effectiveSecondaryChoice);
      if (activeScope !== "FULL") params.set("scope", activeScope);
      if (chartSide !== "over") params.set("side", chartSide);
      if (chartHomeAway) params.set("homeAway", chartHomeAway);
      if (chartHistMinMinutes) params.set("min", String(chartHistMinMinutes));
      if (chartOpponent) params.set("opponent", chartOpponent);
      if (seasonPhase !== "ALL") params.set("phase", seasonPhase);
      params.set('defSeason',defense.options.season);params.set('defWindow',defense.options.window);params.set('defPosition',defense.options.position);if(defense.band!=='all')params.set('defBand',defense.band);
      effectiveAbsences.forEach(name=>params.append("absent",name));
      if(absenceMode==="historical"||effectiveAbsences.length)params.set("absenceScope",absenceMode);
      if(absenceTeamFilter)params.set("absenceTeam",absenceTeamFilter);
      const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }, [effectiveSecondaryChoice,defense.options.season,defense.options.window,defense.options.position,defense.band,activeStat, lineValue, lastN, activeScope, chartSide, chartHomeAway, chartHistMinMinutes, chartOpponent, activeWoTeammate, seasonPhase, absenceKey, absenceMode, absenceTeamFilter,gameContext]);

    const marketContext=(
<div>
        <div className="flex items-center justify-between mb-3 px-1">
          <p className="text-[11px] text-cyan-300 font-black uppercase tracking-widest flex items-center gap-2">
            <LayoutList size={12} className="text-[#10b981]" />
            Contexto de la apuesta
          </p>
          <button
            type="button"
            onClick={() => setShowSupportingData((p) => !p)}
            className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text)] transition-colors border border-[var(--border)] px-2.5 py-1 rounded-lg"
          >
            {showSupportingData ? "Ocultar" : "Mostrar"}
          </button>
        </div>

        {showSupportingData && (
          <SupportingDataGrid
            stats={supportingStats}
            scope={activeScope}
            sampleLabel={currentSampleLabel}
            loading={sampleLoading}
            error={sampleError}
            activeStat={activeStat}
            activeStatLabel={activeStatLabel}
            onFilterChange={handleMetricFilter}
            correlatedMetric={correlatedMetric}
            resetToken={filterResetCount}
          />
        )}
      </div>
  );


  return (
    <div className="space-y-3">
      {!compact&&<FloatingPlayerIdentity playerName={playerName || "Jugador"} statLabel={activeStatLabel} scope={activeScope} />}
      {!compact&&gameContext&&<p className="text-xs font-bold text-[var(--text-muted)]">Partido: {gameContext.away} – {gameContext.home} · {gameContext.date.split('-').reverse().join('/')} · Estadísticas anteriores a esa fecha.</p>}
      {compact?<PlayerSelectionBar market={activeStat} markets={visibleNavStats} scope={activeScope} lastN={lastN} side={chartSide} line={Number(lineValue)} step={1} halfLines={!usesIntegerLine(activeStat)} onMarket={setActiveStat} onScope={value=>setActiveScope(value as SplitScope)} onWindow={setLastN} onSide={setChartSide} onLine={setLineValue} odds={<PlayerOddsComparison movement={gameContext&&playerName?{player:playerName,date:gameContext.date,away:gameContext.away,home:gameContext.home}:undefined} selectedBook={selectedBook} onSelectBook={setSelectedBook} rows={currentPrices} line={Number(lineValue)} side={chartSide} loading={oddsLoading} error={oddsError} eventReady={!!gameContext} eventRows={eventOdds} market={activeStat} scope={activeScope} onRetry={()=>setOddsRetry(n=>n+1)}/>}/>:<>
      {/* MENÚ DE ESTADÍSTICAS */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-2">
        <div className="flex flex-wrap items-center gap-1.5 max-w-full">
          {visibleNavStats.map((stat) => {
            const active = activeStat === stat.id;
            return (
              <button
                key={stat.id}
                type="button"
                onClick={() => setActiveStat(stat.id)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-widest transition-all ${
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
      <div className="flex flex-col md:flex-row justify-between items-center bg-[var(--surface)] border border-[#10b981]/20 rounded-2xl p-3 gap-3 shadow-xl shadow-[#10b981]/5 flex-wrap">
        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
          <div className="flex flex-wrap bg-[var(--surface-soft)] p-1 rounded-xl border border-[var(--border)] max-w-full">
            {SPLIT_SCOPE_OPTIONS.map((scope) => (
              <button
                key={scope.id}
                type="button"
                className={`shrink-0 flex items-center gap-2 px-4 py-2 text-xs font-black rounded-lg transition-all ${
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
                className={`flex-1 md:flex-none px-5 py-2.5 rounded-lg text-xs font-black transition-all ${
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

        <div className="order-3 w-full min-w-0 sm:w-[190px] lg:order-none lg:shrink-0">
          <PlayerOddsComparison movement={gameContext&&playerName?{player:playerName,date:gameContext.date,away:gameContext.away,home:gameContext.home}:undefined} selectedBook={selectedBook} onSelectBook={setSelectedBook} rows={currentPrices} line={Number(lineValue)} side={chartSide} loading={oddsLoading} error={oddsError} eventReady={!!gameContext} eventRows={eventOdds} market={activeStat} scope={activeScope} onSelectLine={value=>{setLineValue(value);setSelectedBook(null);}} onRetry={()=>setOddsRetry(n=>n+1)}/>
        </div>

        <div className="flex flex-wrap items-center gap-3 md:gap-5 w-full md:w-auto justify-between md:justify-end">
                <div role="group" aria-label="Lado de la selección">
                  <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">
                    Lado
                  </p>
                  <div className="grid grid-cols-2 gap-1 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-1">
                    <button
                      type="button"
                      onClick={() => setChartSide("over")}
                      className={`rounded-xl px-3 py-2 text-xs font-black uppercase tracking-widest transition-all ${chartSide === "over" ? "bg-[#10b981] text-black shadow-[0_0_14px_rgba(16,185,129,0.25)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                    >
                      Over
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartSide("under")}
                      className={`rounded-xl px-3 py-2 text-xs font-black uppercase tracking-widest transition-all ${chartSide === "under" ? "bg-red-500 text-white shadow-[0_0_14px_rgba(239,68,68,0.25)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                    >
                      Under
                    </button>
                  </div>
                </div>


          <div className="flex flex-col items-start md:items-end">
            <span className="text-[11px] text-[var(--text-muted)] font-black uppercase tracking-[0.2em] flex items-center gap-1 mb-1">
              <Sparkles size={10} className="text-[#10b981]" />
              Línea
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
            <span className="text-[11px] text-[var(--text-muted)] font-black uppercase tracking-[0.2em] mb-1">
              Promedio: {sampleLoading?'…':avgValue}
              {activeStat === "usage_pct" ? "%" : ""}
            </span>
            <span
              className={`text-3xl font-black tabular-nums leading-none ${hitRateNumber >= 50 ? "text-[#10b981]" : "text-red-500"}`}
            >
              {sampleLoading?'…':hitRate}{sampleLoading||selection.rate===null?"":"%"}
            </span>
          </div>
        </div>
      </div>

      </>}
      {/* SHARE BUTTON */}

      {!analyzerStorageKey&&<div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#10b981]/25 p-3"><PlayerEventControl event={pageEvent}/><span className="ml-auto"><ShareButton onShare={shareCurrentAnalysisUrl}/></span></div>}
      {!compact&&analyzerStorageKey&&<AddSelectionToAnalyzer compact={compact} storageKey={analyzerStorageKey} playerId={playerId||''} playerName={playerName||''} stat={activeStat} scope={activeScope} side={chartSide} line={Number(lineValue)} context={gameContext} team={pageEvent.team??playerTeam} pageSample={pageSample} samplePending={sampleLoading||!!sampleError} managedEvent={pageEvent} onShare={shareCurrentAnalysisUrl} quotes={currentPrices} book={selectedBook} />}


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

      <div className="grid grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
        {/* GRÁFICA PRINCIPAL + ODDS COMPACTAS */}
        <div className="min-w-0">
          <div data-chart-card className="bg-[var(--surface)] p-4 md:p-5 rounded-[2rem] border border-[#10b981]/25 shadow-2xl shadow-[#10b981]/5 relative min-w-0 overflow-hidden">
            {!compact&&<div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#10b981] to-transparent" />}

            <ChartIdentity playerName={playerName || "Jugador"} statLabel={compact?playerMarketLabel(activeStat):activeStatLabel} scope={activeScope} count={chartStats.length} line={Number(lineValue)} loading={sampleLoading} compact={compact} />
            {compact&&<PlayerSampleSummary values={metricStats.map(row=>row.value)} line={Number(lineValue)} side={chartSide} lastN={lastN} loading={sampleLoading} error={sampleError}/>}
            <div data-chart-sample-row className="mb-3 flex flex-wrap items-center justify-between gap-2"><p data-chart-sample className="text-xs text-[var(--text-muted)]">{pageSample?.labels.join(" · ")||PHASE_OPTIONS.find(option=>option.value===seasonPhase)?.label}</p><button type="button" onClick={resetMainFilters} title="Restablecer 20 partidos, dos temporadas, todos los rivales, local y visitante" className="rounded-lg border border-[#10b981]/30 px-3 py-2 text-xs font-bold text-[#10b981]">{compact?"Restablecer · L20":"Muestra base · L20"}</button>{compact&&defenseOpponent&&<button type="button" aria-pressed={chartOpponent===defenseOpponent} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold" onClick={()=>setChartOpponent(chartOpponent===defenseOpponent?"":defenseOpponent)}>vs {defenseOpponent}</button>}</div>

            {(!compact||!isFullScope||activeFilters.length+externalFilters.length>0)&&<div className="mb-3 flex flex-wrap items-center gap-2">
              {!isFullScope && (
                <span className="rounded-xl border border-[#10b981]/30 bg-[#10b981]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-[#10b981]">
                  {activeScopeOption.badgeLabel}
                </span>
              )}
              {activeFilters.length + externalFilters.length > 0 && (
                <span className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-orange-400">
                  {chartStats.length} partidos filtrados
                </span>
              )}

            </div>}


            {!compact&&isFullScope&&<PlayerSecondaryControl market={activeStat} marketLabel={activeStatLabel} choice={effectiveSecondaryChoice} onChange={changeSecondary} rows={chartStats} disabled={sampleLoading||!!sampleError}/>}
            {!isFullScope && periodLoading && <p className="mb-3 text-xs text-cyan-300">Cargando datos de períodos…</p>}
            {!isFullScope && periodError && <p className="mb-3 text-xs text-amber-300">No se pudieron cargar los datos del período.</p>}
            <div className={compact?"w-full relative":"min-h-[470px] w-full relative"}>
              {sampleLoading?<div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg)]" role="status"><Loader2 size={18} className="mr-2 animate-spin text-[#10b981]"/>Actualizando la muestra…</div>:sampleError?<div className="flex min-h-[240px] items-center justify-center p-5 text-sm text-amber-300" role="alert">No pudimos consultar esta muestra. Revisá los filtros o reintentá.</div>:              <PlayerChart
                data={chartStats}
                statKey="value"
                lineValue={lineValue}
                side={chartSide}
                clean={compact}
                overlayKey={opportunityOverlay?.id}
                overlayLabel={opportunityOverlay?.label}
                overlayColor={opportunityOverlay?.color}
                overlayValueReader={opportunityOverlay?(row)=>secondaryValue(row,opportunityOverlay.id):undefined}
                height={compact?350:undefined}
                showSeasonBreaks={compact}
                overlayAxis={isFullScope?secondaryAxis(activeStat,opportunityOverlay?.id):"left"}
              />}
            </div>
            {compact&&<SelectionLegend hasPush={selection.pushes>0} hasMissing={selection.missing>0}/>}
          </div>
          {compact&&!oddsLoading&&!oddsError&&gameContext&&<AlternativeLines quotes={currentPrices} values={chartStats.slice(-10).map(row=>row.value)} historyLabel={chartStats.length>=10?'L10':'de la muestra'} line={Number(lineValue)} book={selectedBook} side={chartSide} onSelect={(value,house)=>{setLineValue(value);setSelectedBook(house);}}/>}
          {compact&&isFullScope&&!sampleLoading&&!sampleError&&<PlayerSupportingStats market={activeStat} rows={chartStats} choice={effectiveSecondaryChoice} onChange={changeSecondary}/>}
          <div id={`absence-comparison-${playerId}`} className="scroll-mt-20"/>
          {playerId&&<details className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3" onToggle={e=>setRotationOpen(e.currentTarget.open)}>
            <summary className="cursor-pointer text-sm font-bold">Rotaciones verificadas · partidos del gráfico</summary>
            <div className="mt-2"><RotationPilot playerId={String(playerId)} gameIds={chartStats.map(row=>row.game_id??row.id)} open={rotationOpen&&!sampleLoading&&!sampleError}/></div>
          </details>}
          {compact&&analyzerStorageKey&&<AddSelectionToAnalyzer compact={compact} storageKey={analyzerStorageKey} playerId={playerId||''} playerName={playerName||''} stat={activeStat} scope={activeScope} side={chartSide} line={Number(lineValue)} context={gameContext} team={pageEvent.team??playerTeam} pageSample={pageSample} samplePending={sampleLoading||!!sampleError} managedEvent={pageEvent} onShare={shareCurrentAnalysisUrl} quotes={currentPrices} book={selectedBook} />}
        </div>
        {/* FILTROS GLOBALES — panel lateral limpio */}
        <div className="min-[1100px]:sticky min-[1100px]:top-4 rounded-[1.5rem] border border-[#10b981]/20 bg-[var(--surface)] p-3 shadow-xl shadow-[#10b981]/5 overflow-hidden">
          <div className="flex flex-col gap-3">
            {compact&&<p className="px-1 text-sm font-bold">Para este partido{gameContext?` · ${gameContext.away}–${gameContext.home}`:""}</p>}
            <div className="grid gap-1 px-1 text-xs text-[var(--text-muted)]">
              <span>Rival del partido: <strong>{pageEvent.opponent||'Sin confirmar'}</strong></span>
              <span>Historial filtrado: <strong>{chartOpponent||'Todos los rivales'}</strong></span>
              {chartOpponent&&chartOpponent!==pageEvent.opponent&&<span>La defensa de este panel usa el rival del historial.</span>}
            </div>
            <DefenseContextCard profile={isFullScope&&minutesValues.length>=5&&Number(avgMinutes)>0&&Number(avgMinutes)<=80?{playerId:Number(playerId),minutes:Number(avgMinutes),sample:minutesValues.length}:undefined} state={defense} opponent={defenseOpponent} scope={activeScope} side={chartSide}/>
            <details ref={historyFilters} className="rounded-xl border border-[var(--border)] p-3"><summary className="cursor-pointer text-sm font-bold text-[var(--text)]">Filtrar histórico</summary><div className="mt-3 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-cyan-300">Fase</span>
              <button
                type="button"
                onClick={resetMainFilters}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                Reset
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1" role="group" aria-label="Fase de la temporada">
              {PHASE_OPTIONS.map(option=><button type="button" key={option.value} aria-pressed={seasonPhase===option.value} title={option.label} onClick={()=>setSeasonPhase(option.value)} className={`min-w-0 rounded-lg px-1 py-2 text-[11px] font-black uppercase ${seasonPhase===option.value?'bg-cyan-400/15 text-cyan-300':'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>{option.value==='Regular Season'?'Regular':option.label}</button>)}
            </div>
            <PlayerAbsenceFilter playerId={String(playerId || '')} scope={absenceMode} team={absenceTeamFilter} onScopeChange={changeAbsenceMode} onTeamChange={changeAbsenceTeam} selected={effectiveAbsences} onChange={changeAbsences} emptyReason={absenceEmptyMessage(effectiveAbsences,currentAbsence.matches)} loading={currentAbsence.loading} error={currentAbsence.error} onRetry={()=>setAbsenceRetry(n=>n+1)} comparison={comparisonMarket(activeStat)?{market:comparisonMarket(activeStat)!,scope:activeScope,side:chartSide,line:Number(lineValue),asOfDate:historyCutoff??eventDate,phase:seasonPhase,lastN:lastN>=999?1000:lastN,opponent:chartOpponent||null,homeAway:chartHomeAway,minMinutes:chartHistMinMinutes,thresholds:[...activeFilters,...externalFilters].filter(f=>f.type==='threshold'&&f.value!==undefined).map(f=>({metric:f.id.replace('threshold:',''),value:Number(f.value)})),unsupportedFilters:[...activeFilters,...externalFilters].some(f=>f.type==='wo')||defense.band!=='all'}:undefined}/>


            {isHistoricalChartMode && (
              <>

                <div>
                  <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">
                    Cancha
                  </p>
                  <div className="grid grid-cols-3 gap-1 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-1">
                    <button
                      type="button"
                      onClick={() => setChartHomeAway(null)}
                      className={`rounded-xl px-2 py-2 text-[11px] font-black uppercase tracking-widest transition-all ${chartHomeAway === null ? "bg-purple-400 text-black" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartHomeAway("HOME")}
                      className={`rounded-xl px-2 py-2 text-[11px] font-black uppercase tracking-widest transition-all ${chartHomeAway === "HOME" ? "bg-purple-400 text-black" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                    >
                      Local
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartHomeAway("AWAY")}
                      className={`rounded-xl px-2 py-2 text-[11px] font-black uppercase tracking-widest transition-all ${chartHomeAway === "AWAY" ? "bg-purple-400 text-black" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                    >
                      Visit.
                    </button>
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-cyan-400/20 bg-cyan-400/[0.035] p-3 min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">
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
                        className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[11px] font-black uppercase tracking-widest text-cyan-300"
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
                  <div className="mt-3 grid grid-cols-6 gap-1 text-[11px] font-black uppercase tracking-widest">
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
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#10b981]">
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
                        className="rounded-lg border border-[#10b981]/20 bg-[#10b981]/10 px-2 py-1 text-[11px] font-black uppercase tracking-widest text-[#10b981]"
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
                      className="min-w-0 flex-1 bg-transparent text-xs font-black uppercase tracking-widest text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-[#10b981] px-2.5 py-1.5 text-[11px] font-black uppercase tracking-widest text-black"
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
                              <span className="block text-xs font-black uppercase tracking-widest">
                                {team.abbr}
                              </span>
                              <span className="block truncate text-[11px] font-bold uppercase tracking-widest opacity-80">
                                {team.short}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                  {historicalChartLoading && (
                    <span className="inline-flex items-center gap-1 text-cyan-300">
                      <Loader2 size={11} className="animate-spin" /> Histórico
                    </span>
                  )}
                  {!historicalChartLoading && historicalChartData?.summary && !effectiveAbsences.length && (
                    <>
                      <span title="Histórico con rival, cancha, minutos y fase seleccionados; no se limita a L5/L10/L20/L30 ni a los filtros de las tarjetas." className="text-[var(--text-muted)]">Histórico · {historicalChartData.summary.games} PJ</span>
                      <span className="rounded-lg border border-[#10b981]/25 bg-[#10b981]/10 px-2 py-1 text-[#10b981]">
                        {historicalChartData.summary.hitRatePct==null?"S/D":`${historicalChartData.summary.hits}/${historicalChartData.summary.decided ?? historicalChartData.summary.games}`}
                      </span>
                      <span className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-cyan-300">
                        HR{" "}
                        {historicalChartData.summary.hitRatePct==null?"S/D":Number(historicalChartData.summary.hitRatePct).toFixed(1)}
                        {historicalChartData.summary.hitRatePct==null?"":"%"}
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
                    <span className="text-red-300">No se pudo cargar el histórico.</span>
                  )}
                </div>
              </>
            )}
            </div></details>
          </div>
        </div>
      </div>

      {analysisMode==="pro"&&detailNavigation}

      {/* CONTEXTO RÁPIDO */}
      {!compact&&(!metricStats.length ? <p className="rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">{sampleLoading?"Actualizando estadísticas…":sampleError?"La muestra no está disponible.":"Sin partidos para esta selección. Ampliá los filtros para analizarla."}</p> : analysisMode === "simple" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            { label: "Prom. histórico", sample:baseSampleLabel, value: seasonAvgValue===null?"S/D":seasonAvgValue.toFixed(1), tone: "text-cyan-300", border: "border-cyan-400/25" },
            { label: "Prom. gráfico", sample:currentSampleLabel, value: filteredAvgValue===null?"S/D":filteredAvgValue.toFixed(1), tone: "text-[#10b981]", border: "border-[#10b981]/25" },
            { label: "Aciertos históricos", sample:`${currentSampleLabel} · ${selection.decided} decididos`, value: selection.rate===null?"S/D":`${hitRate}%`, tone: hitRateNumber >= 50 ? "text-[#10b981]" : "text-red-400", border: hitRateNumber >= 50 ? "border-[#10b981]/25" : "border-red-400/25" },
            { label: "Línea", sample:activeScopeOption.label, value: formatLineValue(lineValue, activeStat), tone: "text-orange-300", border: "border-orange-400/25" },
            { label: "Diferencia", sample:currentSampleLabel, value: lineDifference===null?"S/D":`${(lineDifference ?? -1) >= 0 ? "+" : ""}${lineDifference.toFixed(1)}`, tone: (lineDifference ?? -1) >= 0 ? "text-[#10b981]" : "text-red-400", border: (lineDifference ?? -1) >= 0 ? "border-[#10b981]/25" : "border-red-400/25" },
          ].map((item) => (
            <div key={item.label} className={`rounded-2xl border bg-[var(--surface)] p-4 ${item.border}`}>
              <p className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">{item.label}</p>
              <p className={`mt-1 text-2xl font-black tabular-nums ${item.tone}`}>{item.value}</p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{item.sample} · {activeStatLabel}</p>
            </div>
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--surface)] border border-[#10b981]/25 rounded-2xl p-4 shadow-xl shadow-[#10b981]/5 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-[#10b981]" />
          <p className="text-[11px] text-[#10b981] font-black uppercase tracking-widest">
            Aciertos históricos
          </p>
          <p
            className={`text-2xl font-black ${hitRateNumber >= 50 ? "text-[#10b981]" : "text-red-500"}`}
          >
            {selection.rate===null?"S/D":`${hits}/${selection.decided}`}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-1">
            {trendLabel}{selection.pushes?` · ${selection.pushes} empates`:""}{selection.missing?` · ${selection.missing} S/D`:""}
          </p>
        </div>

        <div className="bg-[var(--surface)] border border-cyan-400/25 rounded-2xl p-4 shadow-xl shadow-cyan-400/5 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-cyan-400" />
          <p className="text-[11px] text-cyan-300 font-black uppercase tracking-widest">
            Min Prom.
          </p>
          <p className="text-2xl font-black text-[var(--text)] tabular-nums">
            {avgMinutes}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-1">
            {volumeLabel}
          </p>
        </div>

        <div className="bg-[var(--surface)] border border-orange-400/25 rounded-2xl p-4 shadow-xl shadow-orange-400/5 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-orange-400" />
          <p className="text-[11px] text-orange-300 font-black uppercase tracking-widest">
            Línea
          </p>
          <p className="text-2xl font-black text-[var(--text)] tabular-nums">
            {formatLineValue(lineValue, activeStat)}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-1">
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
            className={`text-[11px] font-black uppercase tracking-widest ${lowMinuteGames > 0 ? "text-yellow-300" : "text-[#10b981]"}`}
          >
            Alerta
          </p>
          <p className="text-sm font-black text-[#10b981] uppercase flex items-center gap-2">
            <Gauge size={14} />{" "}
            {sampleLoading ? "Cargando muestra" : sampleError ? "No disponible" : !metricStats.length ? "Sin muestra" : minutesValues.length!==metricStats.length ? "Minutos sin confirmar" : !isFullScope ? "Minutos del período" : lowMinuteGames > 0
              ? `${lowMinuteGames} con menos de 20 min`
              : "Sin partidos con menos de 20 min"}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-2 flex items-center gap-1">
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
      ))}

      {(analysisMode==="simple"||detailTab==="volume")&&isFullScope&&<PlayerChangeCard rows={changeRows} referenceRows={changeReferenceRows} market={activeStat} marketLabel={activeStatLabel} cutoff={historyCutoff??eventDate} playerId={playerId} loading={sampleLoading} error={sampleError}/>}
      {analysisMode === "simple" && marketContext}

      {analysisMode === "pro" && (detailTab==="summary"||detailTab==="volume") && <div id={`analysis-panel-${detailTab}`} role="tabpanel" aria-labelledby={`analysis-tab-${detailTab}`}>
      {detailTab==="summary"&&compact&&<div data-compact-summary><PlayerLineExplorer stats={metricStats} line={Number(lineValue)} side={chartSide} marketLabel={playerMarketLabel(activeStat)} loading={sampleLoading} error={sampleError} onSelectLine={value=>{setLineValue(value);setSelectedBook(null);}} formatLine={value=>formatLineValue(value,activeStat)}/></div>}
      {/* PICK INSIGHT PANEL */}
      {detailTab==="summary"&&!compact&&metricStats.length>0&&<PickInsightPanel
        stats={metricStats}
        lineValue={lineValue}
        activeStatLabel={activeStatLabel}
        side={chartSide}
        loading={sampleLoading}
        error={sampleError}
        scope={activeScope}
        hitRate={hitRateNumber}
        hits={hits}
        avgValue={avgValue}
        avgMinutes={avgMinutes}
        lastN={metricStats.length}
        onSelectLine={value=>{setLineValue(value);setSelectedBook(null);}}
        formatLine={value=>formatLineValue(value,activeStat)}
      />}

      {detailTab==="volume"&&marketContext}

      {/* EXPLORADOR HISTÓRICO — separado de la data actual para evitar timeouts y no romper Q1/H1/H2 */}
      {detailTab==="summary"&&isFullScope && seasonPhase === "ALL" && !effectiveAbsences.length && <details className="rounded-xl border border-[var(--border)] p-3"><summary className="cursor-pointer text-sm font-bold">Detalle de estas dos temporadas</summary><PlayerHistoricalExplorer
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
        initialData={historicalChartData}
        initialLoading={historicalChartLoading}
        initialError={historicalChartError}
      /></details>}

      {/* GAME LOG — sortable, extracted component */}
      {detailTab==="summary"&&metricStats.length>0&&<GameLogTable
        stats={metricStats}
        lineValue={lineValue}
        activeStatLabel={activeStatLabel}
        side={chartSide}
        loading={sampleLoading}
        activeScopeLabel={activeScopeOption.label}
        activeStat={activeStat}
        formatLine={(v) => formatLineValue(v, activeStat)}
      />}
      </div>}
    </div>
  );
}
