"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import PlayerChart from "@/components/PlayerChart";
import AltLinesPanel from "@/components/AltLinesPanel";
import SupportingDataGrid from "@/components/SupportingDataGrid";
import PickInsightPanel from "@/components/PickInsightPanel";
import StatFilters, { type ActiveFilter } from "@/components/StatFilters";
import OddsComparisonTable, { type BookOdd } from "@/components/OddsComparisonTable";
import GameLogTable from "@/components/GameLogTable";
import ShareButton from "@/components/ShareButton";
import { usePlayerUrlState } from "@/hooks/usePlayerUrlState";
import { Clock, Gauge, Sparkles, Target, TrendingUp, LayoutList } from "lucide-react";

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
  stakeOdds?: StakePlayerOdd[];
  /** W/O filters coming from InjuryWithWOPanel — merged with internal threshold filters */
  externalFilters?: ActiveFilter[];
  /** Called when external filters should be removed (e.g. user clicks X on a W/O chip) */
  onRemoveExternalFilter?: (id: string) => void;
}

type SplitScope = "FULL" | "Q1" | "H1" | "H2_REG";

type SplitScopeOption = {
  id: SplitScope;
  label: string;
  badgeLabel: string;
  prefix: "" | "q1" | "h1" | "h2";
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SPLIT_SCOPE_OPTIONS: SplitScopeOption[] = [
  { id: "FULL",    label: "PARTIDO",    badgeLabel: "DATOS PARTIDO",    prefix: ""   },
  { id: "Q1",      label: "1ER CUARTO", badgeLabel: "DATOS 1ER CUARTO", prefix: "q1" },
  { id: "H1",      label: "1RA MITAD",  badgeLabel: "DATOS 1RA MITAD",  prefix: "h1" },
  { id: "H2_REG",  label: "2DA MITAD",  badgeLabel: "DATOS 2DA MITAD",  prefix: "h2" },
];

const SPLIT_SCOPE_BY_ID = SPLIT_SCOPE_OPTIONS.reduce<Record<SplitScope, SplitScopeOption>>(
  (acc, o) => { acc[o.id] = o; return acc; },
  {} as Record<SplitScope, SplitScopeOption>
);

const HIDDEN_MAIN_STATS = new Set(["potential_ast", "rebound_chances"]);

// ─── Pure helpers (unchanged from original) ───────────────────────────────────

function normalizeSplitCode(value: any): SplitScope | null {
  const code = String(value || "").trim().toUpperCase();
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
    "pts+ast": ["pa"], "pts+reb": ["pr"], "reb+ast": ["ra"],
    "pts+reb+ast": ["pra"], "3pt": ["fg3m","3pm","three_pm"],
    "3ptm": ["fg3m","3pm","three_pm"], "3pta": ["fg3a","three_pa"],
    "to": ["tov","turnovers"],
  };
  const directCandidates = [statId, ...(aliases[statId] || [])];
  const scopedCandidates = directCandidates.flatMap((key) => [getScopedKey(key, scope), key]);
  const candidates = isPeriodRow ? directCandidates : scopedCandidates;
  for (const key of candidates) {
    if (s?.[key] !== null && s?.[key] !== undefined && s?.[key] !== "") {
      const parsed = Number(s[key]);
      if (Number.isFinite(parsed)) return statId === "usage_pct" ? parsed * 100 : parsed;
    }
  }
  return 0;
}

function getStatValue(s: any, statId: string, scope: SplitScope): number {
  if (statId.includes("+")) {
    return statId.split("+").reduce((acc, part) => acc + getRawStatValue(s, part, scope), 0);
  }
  return getRawStatValue(s, statId, scope);
}

function getMinutesValue(raw: any): number | null {
  const value = raw?.period_minutes ?? raw?.min_text ?? raw?.min ?? raw?.minutes ??
    raw?.mins ?? raw?.minutos ?? raw?.minutes_played ?? raw?.mp ?? null;
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    if (value.includes(":")) {
      const m = Number(value.split(":")[0]);
      return Number.isNaN(m) ? null : m;
    }
    const parsed = Number(value.replace("m", ""));
    return Number.isNaN(parsed) ? null : parsed;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getMinutesLabel(raw: any) {
  const minutes = getMinutesValue(raw);
  if (minutes === null) return "S/D";
  return `${Math.round(minutes)}m`;
}

function getScopedMinutesRaw(raw: any, scope: SplitScope) {
  if (scope === "FULL") return null;
  const prefix = SPLIT_SCOPE_BY_ID[scope]?.prefix;
  if (!prefix) return null;
  return (
    raw?.[`${prefix}_min`] ?? raw?.[`${prefix}_minutes`] ?? raw?.[`${prefix}_mins`] ??
    raw?.[`${prefix}_min_text`] ?? (isPeriodRowForScope(raw, scope) ? raw?.min_text : null) ?? null
  );
}

function getOpponent(item: any) {
  const parts = item?.matchup ? String(item.matchup).trim().split(" ") : [];
  return parts.length > 0 ? parts[parts.length - 1] : "---";
}

function getGameLocation(item: any) {
  return item?.matchup?.includes("@") ? "@" : "vs";
}

function formatDateShort(value: any) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getMonth() + 1}/${d.getDate()}`;
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
    pts: "PTS", ast: "AST", reb: "REB", fg3m: "3PT",
    "pts+ast": "PA", "pts+reb": "PR", "reb+ast": "RA", "pts+reb+ast": "PRA",
  };
  return map[activeStat.toLowerCase()] || null;
}

function findStakeOddsForStat(stakeOdds: StakePlayerOdd[] | undefined, activeStat: string) {
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
    const aO = Number(a.over_price), aU = Number(a.under_price);
    const bO = Number(b.over_price), bU = Number(b.under_price);
    const aB = Number.isFinite(aO) && Number.isFinite(aU) ? Math.abs(aO - aU) : 999;
    const bB = Number.isFinite(bO) && Number.isFinite(bU) ? Math.abs(bO - bU) : 999;
    if (aB !== bB) return aB - bB;
    return Number(a.line) - Number(b.line);
  })[0];
}

function usesIntegerLine(activeStat: string) {
  return ["usage_pct","potential_ast","rebound_chances","touches","passes_made"].includes(activeStat);
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

function getLineStep(_activeStat: string) { return 1; }

function getAutoLine(avg: number, activeStat: string) {
  if (usesIntegerLine(activeStat)) return Math.max(0, Math.round(avg));
  if (avg <= 1) return 0.5;
  return normalizeHalfLine(avg);
}

function adjustLine(prev: number, direction: -1 | 1, activeStat: string) {
  if (usesIntegerLine(activeStat)) return Math.max(0, Math.round(prev) + direction);
  return Math.max(0.5, Number((normalizeHalfLine(prev) + direction).toFixed(1)));
}

function formatLineValue(value: number, activeStat: string) {
  if (usesIntegerLine(activeStat)) return String(Math.round(value));
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getOpportunityOverlayConfig(activeStat: string, scope: SplitScope) {
  if (scope !== "FULL") return null;
  if (activeStat === "ast") return { key: "potential_ast", label: "Pot. AST", color: "#60a5fa", ratioLabel: "Conversión" };
  if (activeStat === "reb") return { key: "rebound_chances", label: "Chances Reb.", color: "#a78bfa", ratioLabel: "Captura" };
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlayerChartContainer({
  stats,
  navStats,
  playerName,
  stakeOdds = [],
  externalFilters = [],
  onRemoveExternalFilter,
}: PlayerChartContainerProps) {

  // ── Core state — synced to URL ─────────────────────────────────────────────
  const {
    activeStat, setActiveStat,
    lineValue,  setLineValue,
    lastN,      setLastN,
    activeScope, setActiveScope,
    shareUrl,
    hasLineParam,
  } = usePlayerUrlState({ defaultStat: "pts", defaultLine: 18.5 });

  // ── Filter state ────────────────────────────────────────────────────────────
  const [activeFilters,       setActiveFilters]       = useState<ActiveFilter[]>([]);
  const [showSupportingData,  setShowSupportingData]  = useState(true);

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
    setActiveFilters([]);
  }, []);

  /** Called by SupportingDataGrid sliders */
  const handleMetricFilter = useCallback(
    (metricId: string, label: string, minValue: number | null) => {
      const filterId = `threshold:${metricId}`;
      if (minValue === null) {
        removeFilter(filterId);
      } else {
        addOrUpdateFilter({ id: filterId, label, type: "threshold", value: minValue });
      }
    },
    [addOrUpdateFilter, removeFilter]
  );

  // ── Derived nav stats ───────────────────────────────────────────────────────
  const visibleNavStats = useMemo(
    () => navStats.filter((stat) => !HIDDEN_MAIN_STATS.has(stat.id)),
    [navStats]
  );

  const activeStatLabel =
    visibleNavStats.find((s) => s.id === activeStat)?.label ||
    navStats.find((s) => s.id === activeStat)?.label ||
    activeStat.toUpperCase();

  const activeScopeOption = SPLIT_SCOPE_BY_ID[activeScope];
  const isFullScope = activeScope === "FULL";
  const opportunityOverlay = useMemo(() => getOpportunityOverlayConfig(activeStat, activeScope), [activeStat, activeScope]);

  // ── Stake odds ───────────────────────────────────────────────────────────────
  const selectedStakeOdds = useMemo(() => findStakeOddsForStat(stakeOdds, activeStat), [stakeOdds, activeStat]);
  const selectedStakeOdd  = useMemo(() => pickPrimaryStakeOdd(selectedStakeOdds), [selectedStakeOdds]);

  // ── Raw scoped stats ─────────────────────────────────────────────────────────
  const scopedRawStats = useMemo(() => {
    const rawStats = stats || [];
    if (activeScope === "FULL") {
      const fullRows = rawStats.filter((s: any) => !s?.split_code || normalizeSplitCode(s.split_code) === "FULL");
      return fullRows.length > 0 ? fullRows : rawStats;
    }
    const longRows = rawStats.filter((s: any) => normalizeSplitCode(s?.split_code) === activeScope);
    return longRows.length > 0 ? longRows : rawStats;
  }, [stats, activeScope]);

  const uniqueStats = useMemo(() => {
    return Array.from(
      new Map(
        scopedRawStats.map((s: any) => {
          const key = s.game_date ? String(s.game_date).split("T")[0] : s.date || s.id || s.game_id;
          return [key, s];
        })
      ).values()
    );
  }, [scopedRawStats]);

  // ── Auto-set line value ───────────────────────────────────────────────────────
  useEffect(() => {
    if (hasLineParam) return;

    if (isFullScope && selectedStakeOdd?.line != null && Number.isFinite(Number(selectedStakeOdd.line))) {
      setLineValue(normalizeLineForStat(Number(selectedStakeOdd.line), activeStat));
      return;
    }
    if (uniqueStats.length > 0) {
      const recent = uniqueStats.slice(0, 10);
      const total = recent.reduce((sum, s) => sum + getStatValue(s, activeStat, activeScope), 0);
      const avg = total / (recent.length || 1);
      setLineValue(getAutoLine(avg, activeStat));
    }
  }, [activeStat, uniqueStats, activeScope, isFullScope, selectedStakeOdd, hasLineParam, setLineValue]);

  // ── Processed stats ───────────────────────────────────────────────────────────
  const processedStats = uniqueStats.map((s: any) => ({
    ...s,
    period_minutes: getScopedMinutesRaw(s, activeScope),
    value: Number(getStatValue(s, activeStat, activeScope).toFixed(1)),
    is_percentage: activeStat === "usage_pct",
  }));

  // ── Apply filters (internal threshold + external W/O) ────────────────────────
  const filteredStats = useMemo(() => {
    let result = processedStats.slice(0, lastN).reverse();

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
      // "context" and "wo" filters display as chips but filtering is data-dependent
    }

    return result;
  }, [processedStats, lastN, activeFilters, externalFilters]);

  const visibleStats = filteredStats;
  const values       = visibleStats.map((s) => Number(s.value) || 0);

  // ── Derived metrics ───────────────────────────────────────────────────────────
  const avgValue = visibleStats.length > 0
    ? (visibleStats.reduce((a, b) => a + b.value, 0) / visibleStats.length).toFixed(1)
    : "0.0";

  const hits           = visibleStats.filter((s) => s.value >= lineValue).length;
  const hitRateNumber  = visibleStats.length > 0 ? Math.round((hits / visibleStats.length) * 100) : 0;
  const hitRate        = String(hitRateNumber);

  const minutesValues  = visibleStats.map((s) => getMinutesValue(s)).filter((m): m is number => m !== null);
  const avgMinutes     = minutesValues.length > 0
    ? (minutesValues.reduce((sum, m) => sum + m, 0) / minutesValues.length).toFixed(1)
    : "S/D";

  const lowMinuteGames = minutesValues.filter((m) => m < 20).length;

  const trendLabel =
    hitRateNumber >= 60 ? "Tendencia fuerte" :
    hitRateNumber >= 50 ? "Tendencia media"  : "Tendencia baja";

  const volumeLabel =
    avgMinutes === "S/D" ? "Sin minutos" :
    Number(avgMinutes) >= 30 ? "Volumen alto" :
    Number(avgMinutes) >= 24 ? "Volumen medio" : "Volumen bajo";

  const lineInputStep = usesIntegerLine(activeStat) ? "1" : "any";

  // ── Infer most correlated metric (simple heuristic) ───────────────────────────
  const correlatedMetric = useMemo(() => {
    if (activeStat === "ast") return "minutes";
    if (activeStat === "reb") return "minutes";
    if (activeStat === "pts") return "usage_pct";
    if (activeStat === "fg3m") return "fg3a";
    return "minutes";
  }, [activeStat]);

  // ── Clear filters when stat changes ──────────────────────────────────────────
  useEffect(() => {
    setActiveFilters([]);
  }, [activeStat]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* MENÚ DE ESTADÍSTICAS */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 shadow-xl">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-[8px] text-[#10b981] font-black uppercase tracking-[0.22em]">Estadística</p>
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
      <div className="flex flex-col md:flex-row justify-between items-center bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 gap-6 shadow-xl">
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

          <div className="bg-[#222] w-[1px] hidden md:block" />

          <div className="flex bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)]">
            {[20, 10, 5].map((n) => (
              <button
                key={n}
                onClick={() => setLastN(n)}
                className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-[10px] font-black transition-all ${
                  lastN === n
                    ? "bg-[var(--brand-soft)] text-[var(--text)] shadow-md border border-[var(--border-strong)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)] border border-transparent"
                }`}
              >
                L{n}
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
                onClick={() => setLineValue((prev) => adjustLine(prev, -1, activeStat))}
                className="px-3 text-[var(--text-muted)] hover:text-[var(--text)] font-black text-xl transition-colors select-none"
              >
                -
              </button>
              <input
                type="number"
                step={lineInputStep}
                value={formatLineValue(lineValue, activeStat)}
                onChange={(e) => setLineValue(parseFloat(e.target.value) || 0)}
                onBlur={() => setLineValue((prev) => normalizeLineForStat(prev, activeStat))}
                className="bg-transparent border-none text-2xl font-black w-16 text-center focus:outline-none text-[var(--text)] p-0 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                onClick={() => setLineValue((prev) => adjustLine(prev, 1, activeStat))}
                className="px-3 text-[var(--text-muted)] hover:text-[var(--text)] font-black text-xl transition-colors select-none"
              >
                +
              </button>
            </div>
          </div>

          <div className="bg-[#222] w-[1px] h-10 hidden md:block" />

          <div className="flex flex-col items-end min-w-[70px]">
            <span className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-[0.2em] mb-1">
              AVG: {avgValue}{activeStat === "usage_pct" ? "%" : ""}
            </span>
            <span className={`text-3xl font-black tabular-nums leading-none ${hitRateNumber >= 50 ? "text-[#10b981]" : "text-red-500"}`}>
              {hitRate}%
            </span>
          </div>
        </div>
      </div>

      {/* SHARE BUTTON */}
      <div className="flex justify-end">
        <ShareButton onShare={shareUrl} />
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

      {/* GRÁFICA + ALT LINES */}
      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-stretch">
        <div className="bg-[var(--surface)] p-4 md:p-6 rounded-[2rem] border border-[var(--border)] shadow-2xl relative min-w-0">
          {!isFullScope && (
            <div className="absolute top-6 right-6 px-3 py-1 bg-[#10b981]/10 border border-[#10b981]/30 text-[#10b981] text-[10px] font-black rounded-md tracking-wider z-10">
              {activeScopeOption.badgeLabel}
            </div>
          )}
          {/* Filter count badge */}
          {activeFilters.length > 0 && (
            <div className="absolute top-6 left-6 px-3 py-1 bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[10px] font-black rounded-md tracking-wider z-10">
              {visibleStats.length} partidos
            </div>
          )}
          <div className="min-h-[410px] w-full relative">
            <PlayerChart
              data={visibleStats}
              statKey="value"
              lineValue={lineValue}
              overlayKey={opportunityOverlay?.key}
              overlayLabel={opportunityOverlay?.label}
              overlayColor={opportunityOverlay?.color}
              overlayRatioLabel={opportunityOverlay?.ratioLabel}
            />
          </div>
        </div>

        <AltLinesPanel
          values={values}
          currentLine={lineValue}
          statId={activeStat}
          statLabel={activeStatLabel}
          onSelectLine={setLineValue}
          stakeOdds={selectedStakeOdds}
          primaryStakeOdd={selectedStakeOdd}
          playerName={playerName}
        />
      </div>

      {/* CONTEXTO RÁPIDO */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
          <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest">Hit Rate</p>
          <p className={`text-2xl font-black ${hitRateNumber >= 50 ? "text-[#10b981]" : "text-red-500"}`}>
            {hits}/{visibleStats.length}
          </p>
          <p className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-1">{trendLabel}</p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
          <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest">Min Prom.</p>
          <p className="text-2xl font-black text-[var(--text)] tabular-nums">{avgMinutes}</p>
          <p className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-1">{volumeLabel}</p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
          <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest">Línea</p>
          <p className="text-2xl font-black text-[var(--text)] tabular-nums">{formatLineValue(lineValue, activeStat)}</p>
          <p className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-1">{activeStatLabel}</p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
          <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest">Alerta</p>
          <p className="text-sm font-black text-[#10b981] uppercase flex items-center gap-2">
            <Gauge size={14} /> {lowMinuteGames > 0 ? `${lowMinuteGames} baja min.` : "Muestra limpia"}
          </p>
          <p className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-2 flex items-center gap-1">
            <TrendingUp size={10} /> L{lastN}
            {(activeFilters.length + externalFilters.length) > 0 && (
              <span className="text-orange-400 ml-1">
                · {activeFilters.length + externalFilters.length} filtro{activeFilters.length + externalFilters.length > 1 ? "s" : ""}
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
        lastN={visibleStats.length}
      />

      {/* SUPPORTING DATA GRID — now with sliders + hide toggle */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <p className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest flex items-center gap-2">
            <LayoutList size={12} />
            Supporting Data
          </p>
          <button
            type="button"
            onClick={() => setShowSupportingData(p => !p)}
            className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text)] transition-colors border border-[var(--border)] px-2.5 py-1 rounded-lg"
          >
            {showSupportingData ? "Ocultar" : "Mostrar"}
          </button>
        </div>

        {showSupportingData && (
          <SupportingDataGrid
            stats={visibleStats}
            activeStat={activeStat}
            activeStatLabel={activeStatLabel}
            onFilterChange={handleMetricFilter}
            correlatedMetric={correlatedMetric}
          />
        )}
      </div>

      {/* ODDS COMPARISON TABLE */}
      {selectedStakeOdds.length > 0 && (
        <OddsComparisonTable
          odds={selectedStakeOdds as BookOdd[]}
          lineValue={lineValue}
          statLabel={activeStatLabel}
          hitRate={hitRateNumber}
          avgValue={Number(avgValue)}
        />
      )}

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
