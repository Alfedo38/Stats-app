"use client";
import Link from "next/link";
import type {TeamMate} from "@/components/TeamMatesPanel";
import NbaNextMatchup from "@/components/NbaNextMatchup";
import RotationPilot from "@/components/RotationPilot";
import NbaFirstQuarterCard from "@/components/NbaFirstQuarterCard";
import {recentPeriodGames} from "@/lib/nbaPeriodSample";
import NbaPlaytypePanel from "@/components/NbaPlaytypePanel";
import NbaResearchStrip from "@/components/NbaResearchStrip";
import {expectedMinutes} from "@/lib/minutesResearch";
import AssistConnections from "@/components/AssistConnections";
import SelectionLegend from './SelectionLegend';
import PlayerSelectionBar from "@/components/PlayerSelectionBar";
import {SeasonWindows} from "@/components/SeasonWindows";
import {seasonWindowValues} from "@/lib/seasonWindows";
import PlayerLineExplorer from "@/components/PlayerLineExplorer";
import {playerMarketLabel} from "@/lib/playerPresentation";


import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import {gamePhase} from "@/lib/nbaGameFilters";
import {historySeasons,playerSeasonWindow,playerWindowRows,twoSeasonRows} from "@/lib/nbaHistoryWindow";
import {opportunityFor} from "@/lib/nbaVisuals";
import { useRouter,useSearchParams } from "next/navigation";
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
import {parseGameContext,putGameContext,playerGameHref,PAGE_MARKETS} from "@/lib/playerNavigation";
import { useAnalysisQuery } from "@/hooks/useAnalysisQuery";
import { recentRivalSelection } from "@/lib/rivalSelection";
import { finiteStat, selectionSummary } from "@/lib/selectionStats";
import {playerHistoryRowsRequest,rescorePlayerHistory} from "@/lib/playerHistorySelection";
import { buildPeriodRows, periodMetricValue } from "@/lib/nbaPeriodStats";
import { sampleCoverage, type AnalysisSample } from "@/lib/nbaAnalysis";
import PlayerChart from "@/components/PlayerChart";
import PlayerChangeCard from "@/components/PlayerChangeCard";
import PlayerOpportunityLegend from "@/components/PlayerSecondaryControl";
import AlternativeLines from "@/components/AlternativeLines";
import PlayerSupportingStats from "@/components/PlayerSupportingStats";
import {reboundSplit,type EvidenceRow} from "@/lib/marketEvidence";
import {secondaryValue,type SecondaryChoice} from "@/lib/playerRecentChange";
import SupportingDataGrid from "@/components/SupportingDataGrid";
import PickInsightPanel from "@/components/PickInsightPanel";
import PlayerHistoricalExplorer from "@/components/PlayerHistoricalExplorer";
import {nbaHistoryCutoff} from "@/lib/injuryReport";
import {comparisonMarket} from "@/lib/absenceComparison";
import {argentinaDate,isDate} from "@/lib/ticketReader/model";
import {cleanPageSample,sampleGameKey} from '@/lib/playerSample';
import StatFilters, { type ActiveFilter } from "@/components/StatFilters";
import GameLogTable from "@/components/GameLogTable";
import PlayerAbsenceFilter from "@/components/PlayerAbsenceFilter";
import {absenceScope as parseAbsenceScope,absenceTeam as parseAbsenceTeam,absenceEmptyMessage,type AbsenceScope} from "@/lib/playerAbsenceContext";
import {parsePhase,phaseRows,absenceRows,cleanAbsences,PHASE_OPTIONS,type NBASeasonPhase} from "@/lib/nbaGameFilters";
import PlayerOddsComparison from "@/components/PlayerOddsComparison";
import {decimalPrice,oddsBook,quoteMatches,type PriceQuote} from "@/lib/nbaOdds";
import ShareButton from "@/components/ShareButton";
import { usePlayerUrlState } from "@/hooks/usePlayerUrlState";
import {
  LayoutList,
  History,
  Loader2,
  Search,
  ShieldAlert,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type StakePlayerOdd = PriceQuote;

function PlayerReboundSplit({rows}:{rows:EvidenceRow[]}){
  const split=reboundSplit(rows);
  if(!split.count)return null;
  const number=(value:number|null)=>value===null?'S/D':value.toLocaleString('es-AR',{maximumFractionDigits:1});
  return <p className="mosk-rebound-split" aria-label="Promedio de rebotes por tipo">
    <span><b>{number(split.offense)}</b> ofensivos</span>
    <span><b>{number(split.defense)}</b> defensivos</span>
    <small>{split.count}/{split.total} PJ con ambos datos</small>
  </p>;
}

interface PlayerChartContainerProps {
  analyzerStorageKey?:string;
  stats: any[];
  navStats: { id: string; label: string }[];
  playerName?: string;
  playerPosition?: string;
  playerTeam?: string|null;
  teammates?: TeamMate[];
  playerId?: string | number | null;
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
  teammates=[],
  playerId,
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
  const searchParams = useSearchParams(),router=useRouter();
  const [seasonWindow,setSeasonWindow]=useState(()=>playerSeasonWindow(searchParams.get("seasonWindow")));
  const linkedContext=useMemo(()=>parseGameContext(searchParams),[searchParams]);
  const [rotationOpen,setRotationOpen]=useState(false);
  const historyFilters=useRef<HTMLDetailsElement>(null);
  const chartCard=useRef<HTMLDivElement>(null);
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
  const [secondaryChoice,setSecondaryChoice]=useState<SecondaryChoice>("auto");
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
    setSeasonWindow("current");
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
  const opportunityOverlay = compact?undefined:opportunityFor(activeStat,activeScope);
  const historicalMarket = useMemo(
    () => activeStat==='fg2a'?'2PA':activeStat==='fg2m'?'2PM':getStakePropType(activeStat),
    [activeStat],
  );
  const isHistoricalChartMode = isFullScope && Boolean(historicalMarket);
  const windowLabel = `L${lastN}`;

  const historyQuery=useAnalysisQuery(isHistoricalChartMode&&!pageEvent.loading&&historicalMarket&&playerName?'/api/player-history':null,playerHistoryRowsRequest({
    playerId,playerName,market:historicalMarket,mode:chartOpponent?'all':'last2',
    opponent:chartOpponent||null,homeAway:chartHomeAway,minMinutes:chartHistMinMinutes,woTeammate:null,phase:seasonPhase,limit:1000,asOfDate:historyCutoff,
  }));
  const historicalChartData=historyQuery.data;
  const scoredHistory=useMemo(()=>rescorePlayerHistory(historicalChartData,Number(lineValue),chartSide),[historicalChartData,lineValue,chartSide]);
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
  const firstQuarterGames=useMemo(()=>activeScope==='Q1'?recentPeriodGames(phaseRows(twoSeasonStats,seasonPhase),numericPlayerId,historyCutoff??eventDate):[],[activeScope,twoSeasonStats,seasonPhase,numericPlayerId,historyCutoff,eventDate]);

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
    const recent=uniqueStats.slice(0,10).map(row=>getStatValue(row,activeStat,activeScope)).filter(Number.isFinite);
    if(recent.length){
      autoLineContext.current=context;
      setLineValue(getAutoLine(recent.reduce((sum,value)=>sum+value,0)/recent.length,activeStat));
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

  const effectiveSeason=effectiveAbsences.length?"last2":seasonWindow;
  const windowLocal=useMemo(()=>playerWindowRows(filteredStatsBeforeWindow,historyCutoff??eventDate,effectiveSeason,!!chartOpponent,false),[filteredStatsBeforeWindow,historyCutoff,eventDate,effectiveSeason,chartOpponent]);
  const visibleStats = useMemo(()=>lastN>=999?windowLocal:windowLocal.slice(-lastN),[windowLocal,lastN]);

  const historicalChartStats = useMemo(() => {
    const games = Array.isArray(historicalChartData?.games)
      ? historicalChartData.games
      : [];
    return playerWindowRows<any>(games,historyCutoff??eventDate,"last2",!!chartOpponent)
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
  }, [historicalChartData,historyCutoff,eventDate,chartOpponent]);

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
  const windowHistory=useMemo(()=>playerWindowRows(sharedHistoricalBeforeWindow,historyCutoff??eventDate,effectiveSeason,!!chartOpponent),[sharedHistoricalBeforeWindow,historyCutoff,eventDate,effectiveSeason,chartOpponent]);
  const sharedHistoricalWindow=useMemo(()=>lastN>=999?windowHistory:windowHistory.slice(-lastN),[windowHistory,lastN]);
  const defenseFilterLoading=defense.band!=="all"&&defense.loading;
  const defenseFilterError=defense.band!=="all"&&!defense.loading&&(!defense.report||!defense.canFilter)?"El filtro defensivo no tiene una referencia completa. Quitá el filtro o elegí otra temporada.":null;
  const sampleLoading=pageEvent.loading||defenseFilterLoading||currentAbsence.loading||(isHistoricalChartMode?historicalChartLoading:!isFullScope&&periodLoading);
  const sampleError=defenseFilterError||currentAbsence.error||(isHistoricalChartMode?historicalChartError:!isFullScope?periodError:null);
  const chartStats: any[] = useMemo(()=>sampleLoading||sampleError?[]:isHistoricalChartMode?sharedHistoricalWindow:visibleStats,[sampleLoading,sampleError,isHistoricalChartMode,sharedHistoricalWindow,visibleStats]);
  const metricStats: any[] = chartStats;
  const seasonRows=useMemo(()=>seasonWindowValues(isHistoricalChartMode?sharedHistoricalBeforeWindow:filteredStatsBeforeWindow,historyCutoff??eventDate),[isHistoricalChartMode,sharedHistoricalBeforeWindow,filteredStatsBeforeWindow,historyCutoff,eventDate]);
  const changeRows=sampleLoading||sampleError?[]:isHistoricalChartMode?windowHistory:windowLocal;
  const seasonLabels=historySeasons(historyCutoff??eventDate);
  const windowLabelText=chartOpponent?(isHistoricalChartMode?"Hasta 4 temporadas":"Hasta 2 temporadas"):effectiveSeason==='last2'?seasonLabels.join(" + "):seasonLabels[effectiveSeason==='previous'?1:0];
  const changeReferenceRows=useMemo(()=>[...twoSeasonStats,...historicalChartStats],[twoSeasonStats,historicalChartStats]);
  const pageSample=useMemo(()=>{
    if(!/^[1-9]\d{0,12}$/.test(String(playerId))||!isDate(eventDate))return undefined;
    const labels=[windowLabelText,seasonPhase==='ALL'?'Regular + playoffs':seasonPhase==='Playoffs'?'Playoffs':'Temporada regular',chartHomeAway==='HOME'?'Solo local':chartHomeAway==='AWAY'?'Solo visitante':'Local y visitante',chartOpponent?`vs ${chartOpponent}`:'Todos los rivales',chartHistMinMinutes!==null?`MIN ≥ ${chartHistMinMinutes}`:'',effectiveAbsences.length?`Sin ${effectiveAbsences.join(', ')}`:'',...activeFilters.map(f=>f.label),...externalFilters.map(f=>f.label),defense.band!=='all'?`Defensa: ${DEFENSE_BANDS[defense.band]}`:''].filter(Boolean).map(x=>x.slice(0,100));
    return cleanPageSample({version:1,playerId:String(playerId),eventDate,cutoffDate:historyCutoff??eventDate,scope:activeScope,phase:seasonPhase,seasons:chartOpponent&&isHistoricalChartMode?'all':'last2',homeAway:chartHomeAway,opponent:chartOpponent||null,minMinutes:chartHistMinMinutes,labels:labels.slice(0,12),gameIds:chartStats.map(row=>sampleGameKey(row.game_id??row.id)).filter(Boolean).slice(0,1000)});
  },[playerId,eventDate,historyCutoff,activeScope,seasonPhase,chartHomeAway,chartOpponent,chartHistMinMinutes,absenceKey,activeFilters,externalFilters,defense.band,chartStats,windowLabelText,isHistoricalChartMode]);
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
  const currentSampleLabel=`${windowLabel} · ${metricStats.length} PJ`;
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
      if (activeScope !== "FULL") params.set("scope", activeScope);
      if (chartSide !== "over") params.set("side", chartSide);
      if (chartHomeAway) params.set("homeAway", chartHomeAway);
      if (chartHistMinMinutes) params.set("min", String(chartHistMinMinutes));
      if (chartOpponent) params.set("opponent", chartOpponent);
      if (seasonPhase !== "ALL") params.set("phase", seasonPhase);
      if(seasonWindow!=="current")params.set("seasonWindow",seasonWindow);
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
  }, [defense.options.season,defense.options.window,defense.options.position,defense.band,activeStat, lineValue, lastN, activeScope, chartSide, chartHomeAway, chartHistMinMinutes, chartOpponent, activeWoTeammate, seasonPhase, absenceKey, absenceMode, absenceTeamFilter,gameContext,seasonWindow]);

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


  const activeContextLabels = [
    seasonPhase!=="ALL"?PHASE_OPTIONS.find(option=>option.value===seasonPhase)?.label:null,
    chartHomeAway==="HOME"?"Solo local":chartHomeAway==="AWAY"?"Solo visitante":null,
    chartHistMinMinutes!==null?`Desde ${chartHistMinMinutes} min`:null,
    chartOpponent?`vs. ${chartOpponent}`:null,
    effectiveAbsences.length?`Sin ${effectiveAbsences.join(", ")}`:null,
    defense.band!=="all"?DEFENSE_BANDS[defense.band]:null,
  ].filter(Boolean);
  const filtered = seasonWindow!=="current" || activeContextLabels.length>0 || activeFilters.length>0 || externalFilters.length>0 || Boolean(activeWoTeammate);
  const rosterPlayers = [...new Map(teammates.filter(p=>String(p.id)!==String(playerId)&&/^[1-9]\d{0,12}$/.test(String(p.id))&&(p.full_name||p.player_name)).map(p=>[String(p.id),p])).values()];
  const canAddToAnalyzer=Boolean(analyzerStorageKey&&PAGE_MARKETS[activeStat]);
  const displayStat=playerMarketLabel(activeStat);
  const formatDecimal=(value:number)=>value.toLocaleString("es-AR",{maximumFractionDigits:1});
  const gameRival=pageEvent.opponent;
  const minuteTeam=pageEvent.team??playerTeam;
  const minuteGuide=isFullScope&&minuteTeam&&gameContext?expectedMinutes(twoSeasonStats,historyCutoff??eventDate,minuteTeam):null;
  const rivalHistory=gameRival&&!sampleLoading&&!sampleError&&!chartOpponent
    ?recentRivalSelection(isHistoricalChartMode?sharedHistoricalBeforeWindow:filteredStatsBeforeWindow,gameRival,Number(lineValue),chartSide)
    :null;
  const rosterContext=gameContext&&playerTeam&&[gameContext.away,gameContext.home].includes(playerTeam)?gameContext:null;
  const teamPlayerHref=(id:string|number)=>{
    const [path,query]=playerGameHref(id,rosterContext,playerTeam).split("?");
    const q=new URLSearchParams(query);
    q.set("stat",activeStat);q.set("n",String(lastN));
    if(seasonWindow!=="current")q.set("seasonWindow",seasonWindow);
    if(activeScope!=="FULL")q.set("scope",activeScope);
    return `${path}?${q}`;
  };
  return (
    <div className="space-y-3" data-mosk-analysis>
      <PlayerSelectionBar market={activeStat} markets={visibleNavStats} scope={activeScope} lastN={lastN} side={chartSide} line={Number(lineValue)} halfLines={!usesIntegerLine(activeStat)} onMarket={setActiveStat} onScope={value=>setActiveScope(value as SplitScope)} onWindow={setLastN} onSide={setChartSide} onLine={setLineValue} onStep={direction=>setLineValue(prev=>Math.min(usesIntegerLine(activeStat)?300:299.5,adjustLine(prev,direction,activeStat)))}
        odds={<PlayerOddsComparison selectedBook={selectedBook} onSelectBook={setSelectedBook} rows={currentPrices} line={Number(lineValue)} side={chartSide} loading={oddsLoading} error={oddsError} eventReady={!!gameContext} eventRows={eventOdds} market={activeStat} scope={activeScope} onRetry={()=>setOddsRetry(n=>n+1)}/>}
      />
      {!oddsLoading&&!oddsError&&gameContext&&<AlternativeLines quotes={currentPrices} values={chartStats.map(row=>row.value)} historyLabel="de la muestra" line={Number(lineValue)} book={selectedBook} side={chartSide} onSelect={(value,house)=>{setLineValue(value);setSelectedBook(house);}}/>}
      {canAddToAnalyzer?<AddSelectionToAnalyzer compact storageKey={analyzerStorageKey!} playerId={playerId||''} playerName={playerName||''} stat={activeStat} scope={activeScope} side={chartSide} line={Number(lineValue)} context={gameContext} team={pageEvent.team??playerTeam} pageSample={pageSample} samplePending={sampleLoading||!!sampleError} managedEvent={pageEvent} onShare={shareCurrentAnalysisUrl} quotes={currentPrices} book={selectedBook} />:
        <div className="mosk-selection-actions"><PlayerEventControl event={pageEvent}/><span className="ml-auto"><ShareButton onShare={shareCurrentAnalysisUrl}/></span></div>}

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

      <div className="mosk-analysis-grid">
        {/* GRÁFICA PRINCIPAL + ODDS COMPACTAS */}
        <div className="min-w-0">
          <div ref={chartCard} data-chart-card className="mosk-chart-card scroll-mt-20">
            <header data-chart-identity className="mosk-chart-heading">
              <div><h2>{displayStat}</h2><span>{!isFullScope?activeScopeOption.label+" · ":""}{chartStats.length} PJ · {chartSide==="over"?"Más":"Menos"} {formatDecimal(Number(lineValue))}</span></div>
              {!sampleLoading&&!sampleError&&selection.valid>0&&<dl className="mosk-chart-stats">
                <div><dt>Promedio</dt><dd>{selection.average===null?"S/D":formatDecimal(selection.average)}{activeStat==="usage_pct"?"%":""}</dd></div>
                <div><dt>Acierto histórico</dt><dd>{selection.rate===null?"S/D":`${hitRate}%`}{selection.decided>0&&<small>{hits}/{selection.decided}</small>}</dd></div>
                {minutesValues.length===metricStats.length&&isFullScope&&<div><dt>Minutos</dt><dd>{formatDecimal(Number(avgMinutes))}</dd></div>}
              </dl>}
            </header>
            {!sampleLoading&&!sampleError&&<NbaResearchStrip seasons={seasonRows} rival={gameRival}
              rivalHistory={rivalHistory} line={Number(lineValue)} side={chartSide}
              onFilterRival={!chartOpponent&&gameRival?()=>setChartOpponent(gameRival):undefined}/>}
            <div className="mosk-chart-tools" data-chart-sample-row>
              {gameRival&&<button type="button" className="mosk-soft-button" aria-pressed={chartOpponent===gameRival} onClick={()=>setChartOpponent(chartOpponent===gameRival?"":gameRival)}>Contra {gameRival}</button>}
              <select className="mosk-soft-button" aria-label="Temporada del gráfico" value={chartOpponent?"rival":effectiveSeason} disabled={!!chartOpponent||!!effectiveAbsences.length} onChange={e=>setSeasonWindow(playerSeasonWindow(e.target.value))}>
                {chartOpponent&&<option value="rival">{windowLabelText}</option>}
                <option value="current">{seasonLabels[0]} · Actual</option><option value="previous">{seasonLabels[1]} · Anterior</option><option value="last2">Dos temporadas</option>
              </select>
              {rosterPlayers.length>0&&<select className="mosk-soft-button mosk-roster-picker" aria-label="Cambiar de jugador" value="" onChange={e=>{if(e.target.value)router.push(teamPlayerHref(e.target.value));}}><option value="">Cambiar jugador</option>{rosterPlayers.map(p=><option key={String(p.id)} value={String(p.id)}>{p.full_name||p.player_name}</option>)}</select>}
              <button type="button" className="mosk-soft-button" onClick={()=>{if(historyFilters.current){historyFilters.current.open=true;historyFilters.current.scrollIntoView({block:"nearest"});historyFilters.current.querySelector("summary")?.focus({preventScroll:true});}}}>Filtros</button>
              {activeContextLabels.map((text,index)=><span className="mosk-filter-chip" key={`${text}-${index}`}>{text}</span>)}
              {(filtered||lastN!==20)&&<button type="button" onClick={resetMainFilters} title="Quitar filtros y volver a los últimos 20" className="mosk-text-link">Restablecer filtros</button>}
              {!sampleLoading&&!sampleError&&selection.valid>0&&selection.missing>0&&<span className="mosk-sample-coverage">{selection.valid}/{selection.total} partidos con datos</span>}
            </div>
            {!sampleLoading&&!sampleError&&opportunityOverlay&&<PlayerOpportunityLegend market={activeStat} scope={activeScope} rows={chartStats}/>}
            {!isFullScope && periodLoading && <p className="mb-3 text-xs text-cyan-300">Cargando datos de períodos…</p>}
            {!isFullScope && periodError && <p className="mb-3 text-xs text-amber-300">No se pudieron cargar los datos del período.</p>}
            <div className="w-full relative">
              {sampleLoading?<div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg)]" role="status"><Loader2 size={18} className="mr-2 animate-spin text-[#10b981]"/>Actualizando la muestra…</div>:sampleError?<div className="flex min-h-[240px] items-center justify-center p-5 text-sm text-amber-300" role="alert">No pudimos consultar esta muestra. Revisá los filtros o reintentá.</div>:              <PlayerChart
                data={chartStats}
                statKey="value"
                mainMetric={activeStat}
                lineValue={lineValue}
                side={chartSide}
                clean={true}
                overlayKey={opportunityOverlay}
                overlayLabel={opportunityOverlay==="potential_ast"?"Asistencias potenciales":opportunityOverlay==="rebound_chances"?"Chances de rebote":undefined}
                overlayValueReader={opportunityOverlay?(row)=>secondaryValue(row,opportunityOverlay):undefined}
                height={380}
                showSeasonBreaks={true}
                overlayAxis="left"
              />}
            </div>
            {compact&&<SelectionLegend hasPush={selection.pushes>0} hasMissing={selection.missing>0}/>}
            {activeStat==="reb"&&isFullScope&&!sampleLoading&&!sampleError&&<PlayerReboundSplit rows={chartStats}/>}
          </div>
          {compact&&isFullScope&&!sampleLoading&&!sampleError&&<PlayerSupportingStats market={activeStat} rows={chartStats} choice={secondaryChoice} onChange={setSecondaryChoice}/>}
          {activeScope==='Q1'&&<NbaFirstQuarterCard playerId={numericPlayerId} games={firstQuarterGames} splits={periodSplitRows} splitsLoading={periodLoading} splitsError={periodError}/>}
          <div id={`absence-comparison-${playerId}`} className="scroll-mt-20"/>
          {playerId&&isFullScope&&activeStat==="ast"&&<AssistConnections playerId={String(playerId)}
            gameIds={chartStats.map(row=>row.game_id??row.id)} enabled={!sampleLoading&&!sampleError}
            cutoff={historyCutoff??eventDate} rival={gameRival} context={gameContext}/>}

          {playerId&&isFullScope&&["pts","fga","fgm","fg2a","fg2m","fg3a","fg3m"].includes(activeStat)&&<NbaPlaytypePanel playerId={String(playerId)} cutoff={historyCutoff??eventDate} rival={gameRival} context={gameContext}/>}
          {playerId&&<details className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3" onToggle={e=>setRotationOpen(e.currentTarget.open)}>
            <summary className="cursor-pointer text-sm font-bold">Rotaciones de los partidos del gráfico</summary>
            <div className="mt-2"><RotationPilot playerId={String(playerId)} gameIds={chartStats.map(row=>row.game_id??row.id)} open={rotationOpen&&!sampleLoading&&!sampleError}/></div>
          </details>}

        </div>
        <aside aria-label="Contexto del partido" className="mosk-context-column">
            <NbaNextMatchup context={gameContext} team={pageEvent.team??playerTeam} playerId={playerId??undefined} market={activeStat} scope={activeScope} rivalHistory={rivalHistory} minuteGuide={minuteGuide}
              onFilterRival={!chartOpponent&&gameRival?()=>setChartOpponent(gameRival):undefined}
              onApplyAbsences={names=>{changeAbsences(names);chartCard.current?.scrollIntoView({block:"start"});}}/>
            {chartOpponent&&gameRival&&chartOpponent!==gameRival&&<p className="mosk-context-note">Defensa del rival elegido en el historial: {chartOpponent}.</p>}
            {defenseOpponent&&defense.market&&<DefenseContextCard profile={isFullScope&&minutesValues.length>=5&&Number(avgMinutes)>0&&Number(avgMinutes)<=80?{playerId:Number(playerId),minutes:Number(avgMinutes),sample:minutesValues.length}:undefined} state={defense} opponent={defenseOpponent} scope={activeScope} side={chartSide}/>}
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
                  {!historicalChartLoading && scoredHistory?.summary && !effectiveAbsences.length && (
                    <>
                      <span title="Histórico con rival, cancha, minutos y fase seleccionados; no se limita a L5/L10/L20/L30 ni a los filtros de las tarjetas." className="text-[var(--text-muted)]">Histórico · {scoredHistory.summary.games} PJ</span>
                      <span className="rounded-lg border border-[#10b981]/25 bg-[#10b981]/10 px-2 py-1 text-[#10b981]">
                        {scoredHistory.summary.hitRatePct==null?"S/D":`${scoredHistory.summary.hits}/${scoredHistory.summary.decided ?? scoredHistory.summary.games}`}
                      </span>
                      <span className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-cyan-300">
                        HR{" "}
                        {scoredHistory.summary.hitRatePct==null?"S/D":Number(scoredHistory.summary.hitRatePct).toFixed(1)}
                        {scoredHistory.summary.hitRatePct==null?"":"%"}
                      </span>
                      <span className="rounded-lg border border-orange-400/25 bg-orange-400/10 px-2 py-1 text-orange-300">
                        AVG {scoredHistory.summary.avg ?? "S/D"}
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
        </aside>
      </div>

      {analysisMode==="pro"&&detailNavigation}

      {detailTab==="summary"&&!sampleLoading&&!sampleError&&selection.valid>0&&<SeasonWindows seasons={seasonRows} line={Number(lineValue)} side={chartSide}/>}

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
        initialData={scoredHistory}
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
