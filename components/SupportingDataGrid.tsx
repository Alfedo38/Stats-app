"use client";

import {
  Activity,
  Eye,
  Gauge,
  GitMerge,
  MousePointer2,
  Timer,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SupportingDataGridProps = {
  stats: any[];
  activeStat: string;
  activeStatLabel: string;
  /** Called when a slider filter changes. Pass null value to clear. */
  onFilterChange?: (metricId: string, label: string, minValue: number | null) => void;
  /** ID of the metric most correlated with hit rate — highlight it */
  correlatedMetric?: string;
};

type MetricConfig = {
  id: string;
  label: string;
  keys: string[];
  kind?: "number" | "percent" | "minutes";
  icon: any;
};

// ─── Metric configs ───────────────────────────────────────────────────────────

const COMMON_METRICS: MetricConfig[] = [
  { id: "minutes",   label: "Min",    keys: ["min","minutes","mins","minutes_played","mp"], kind: "minutes", icon: Timer },
  { id: "usage_pct", label: "Usage",  keys: ["usage_pct","usg_pct"], kind: "percent", icon: Gauge },
  { id: "touches",   label: "Toques", keys: ["touches"], icon: MousePointer2 },
];

const METRICS_BY_STAT: Record<string, MetricConfig[]> = {
  pts: [
    ...COMMON_METRICS,
    { id: "fga",  label: "FGA", keys: ["fga"],  icon: Activity },
    { id: "fgm",  label: "FGM", keys: ["fgm"],  icon: TrendingUp },
    { id: "fg3a", label: "3PA", keys: ["fg3a"], icon: Eye },
  ],
  ast: [
    ...COMMON_METRICS,
    { id: "potential_ast", label: "Pot AST", keys: ["potential_ast","pot_ast"], icon: GitMerge },
    { id: "passes_made",   label: "Pases",   keys: ["passes_made"],            icon: Activity },
    { id: "ast",           label: "AST",     keys: ["ast"],                    icon: TrendingUp },
  ],
  reb: [
    ...COMMON_METRICS,
    { id: "rebound_chances", label: "REB CH", keys: ["rebound_chances","reb_chances"], icon: Eye },
    { id: "reb",             label: "REB",    keys: ["reb"],                           icon: TrendingUp },
    { id: "oreb",            label: "OREB",   keys: ["oreb"],                          icon: TrendingUp },
  ],
  fg3m: [
    ...COMMON_METRICS,
    { id: "fg3a",    label: "3PA",  keys: ["fg3a"],    icon: Eye },
    { id: "fg3m",    label: "3PTM", keys: ["fg3m"],    icon: TrendingUp },
    { id: "fg3_pct", label: "3P%",  keys: ["fg3_pct"], kind: "percent", icon: Gauge },
  ],
  fg3a: [
    ...COMMON_METRICS,
    { id: "fg3a", label: "3PA",  keys: ["fg3a"], icon: Eye },
    { id: "fg3m", label: "3PTM", keys: ["fg3m"], icon: TrendingUp },
  ],
  potential_ast: [
    ...COMMON_METRICS,
    { id: "potential_ast", label: "Pot AST", keys: ["potential_ast","pot_ast"], icon: GitMerge },
    { id: "passes_made",   label: "Pases",   keys: ["passes_made"],            icon: Activity },
    { id: "ast",           label: "AST",     keys: ["ast"],                    icon: TrendingUp },
  ],
  rebound_chances: [
    ...COMMON_METRICS,
    { id: "rebound_chances", label: "REB CH", keys: ["rebound_chances","reb_chances"], icon: Eye },
    { id: "reb",             label: "REB",    keys: ["reb"],                           icon: TrendingUp },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseValue(raw: any, kind?: MetricConfig["kind"]): number | null {
  if (raw === null || raw === undefined || raw === "") return null;

  if (typeof raw === "string" && raw.includes(":")) {
    const minutes = Number(raw.split(":")[0]);
    return Number.isNaN(minutes) ? null : minutes;
  }

  const n = Number(String(raw).replace("m", "").replace("%", ""));
  if (Number.isNaN(n)) return null;

  if (kind === "percent" && n > 0 && n <= 1) return n * 100;
  return n;
}

function getMetricValue(row: any, metric: MetricConfig): number | null {
  for (const key of metric.keys) {
    const parsed = parseValue(row?.[key], metric.kind);
    if (parsed !== null) return parsed;
  }
  return null;
}

function formatValue(value: number | null, kind?: MetricConfig["kind"]): string {
  if (value === null) return "S/D";
  if (kind === "minutes") return `${Math.round(value)}m`;
  if (kind === "percent") return `${value.toFixed(1)}%`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatBarLabel(value: number, kind?: MetricConfig["kind"]): string {
  if (kind === "minutes") return `${Math.round(value)}`;
  if (kind === "percent") return `${Math.round(value)}`;
  if (Math.abs(value) >= 100) return `${Math.round(value)}`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildMetrics(activeStat: string): MetricConfig[] {
  if (activeStat.includes("ast")) return METRICS_BY_STAT.ast;
  if (activeStat.includes("reb")) return METRICS_BY_STAT.reb;
  if (activeStat === "fg3m" || activeStat === "fg3a") return METRICS_BY_STAT[activeStat];
  return METRICS_BY_STAT[activeStat] || METRICS_BY_STAT.pts;
}

// ─── Trend indicator ──────────────────────────────────────────────────────────

type TrendDirection = "up" | "down" | "flat";

function getTrend(last: number | null, avg: number | null): TrendDirection {
  if (last === null || avg === null || avg === 0) return "flat";
  const pct = ((last - avg) / avg) * 100;
  if (pct > 5) return "up";
  if (pct < -5) return "down";
  return "flat";
}

function TrendIcon({ direction }: { direction: TrendDirection }) {
  if (direction === "up")   return <TrendingUp   size={11} className="text-[#10b981]" />;
  if (direction === "down") return <TrendingDown  size={11} className="text-red-400" />;
  return                           <Minus         size={11} className="text-[var(--text-muted)]" />;
}

// ─── Mini bar strip ───────────────────────────────────────────────────────────

function MiniBarStrip({
  series,
  avg,
  minFilter,
}: {
  series: { value: number; label: string }[];
  avg: number | null;
  minFilter: number;
}) {
  const max = Math.max(1, ...series.map((i) => i.value));
  const floor = 24;
  const ceiling = 62;

  return (
    <div className="h-[60px] flex items-end gap-1.5 overflow-hidden">
      {series.map((item, index) => {
        const isFiltered = item.value < minFilter;
        const normalized = item.value <= 0 ? 0 : item.value / max;
        const height = item.value <= 0 ? 18 : Math.max(floor, Math.round(normalized * ceiling));
        const isStrong = avg === null ? item.value > 0 : item.value >= avg;

        return (
          <div key={index} className="flex-1 min-w-0 h-full flex items-end">
            <div
              title={item.label}
              className={`w-full rounded-t-md flex items-start justify-center pt-1 overflow-hidden transition-opacity ${
                isFiltered
                  ? "opacity-25 bg-[#374151]"
                  : isStrong
                  ? "bg-[#10b981]"
                  : "bg-[#374151]"
              }`}
              style={{ height }}
            >
              <span
                className={`text-[8px] leading-none font-black tabular-nums truncate px-[1px] ${
                  isStrong && !isFiltered ? "text-black" : "text-[var(--text)]"
                }`}
              >
                {item.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Single metric card ───────────────────────────────────────────────────────

function MetricCard({
  metric,
  series,
  avg,
  last,
  Icon,
  hasData,
  isCorrelated,
  onFilterChange,
}: {
  metric: MetricConfig;
  series: { value: number; label: string }[];
  avg: number | null;
  last: number | null;
  Icon: any;
  hasData: boolean;
  isCorrelated: boolean;
  onFilterChange?: (metricId: string, label: string, minValue: number | null) => void;
}) {
  const maxVal = Math.max(0, ...series.map((s) => s.value));
  const [sliderValue, setSliderValue] = useState(0);

  const trend = getTrend(last, avg);

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setSliderValue(val);
    if (!onFilterChange) return;
    if (val === 0) {
      onFilterChange(metric.id, metric.label, null);
    } else {
      const displayVal = metric.kind === "minutes" ? `${val}m` : String(val);
      onFilterChange(metric.id, `${metric.label} ≥ ${displayVal}`, val);
    }
  };

  const resetSlider = () => {
    setSliderValue(0);
    onFilterChange?.(metric.id, metric.label, null);
  };

  return (
    <div
      className={`border rounded-2xl p-3 min-h-[148px] transition-colors ${
        isCorrelated
          ? "bg-[#10b981]/5 border-[#10b981]/30"
          : "bg-[var(--bg)]/45 border-[var(--border)]"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${
              isCorrelated
                ? "bg-[#10b981]/20 border-[#10b981]/40"
                : "bg-[#10b981]/10 border-[#10b981]/25"
            }`}
          >
            <Icon size={14} className="text-[#10b981]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest truncate">
                {metric.label}
              </p>
              {isCorrelated && (
                <span className="text-[7px] text-[#10b981] font-black uppercase tracking-widest shrink-0">
                  ★ clave
                </span>
              )}
            </div>
            <p className="text-base text-[var(--text)] font-black tabular-nums leading-none mt-0.5">
              {formatValue(avg, metric.kind)}
            </p>
          </div>
        </div>

        {/* Último + tendencia */}
        <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
          <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest">
            último
          </p>
          <p className="text-[#10b981] text-xs font-black tabular-nums">
            {formatValue(last, metric.kind)}
          </p>
          <TrendIcon direction={trend} />
        </div>
      </div>

      {/* Bars */}
      {hasData ? (
        <>
          <MiniBarStrip series={series} avg={avg} minFilter={sliderValue} />

          {/* Range slider */}
          {onFilterChange && maxVal > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={Math.ceil(maxVal)}
                step={metric.kind === "percent" ? 5 : 1}
                value={sliderValue}
                onChange={handleSlider}
                className="flex-1 h-[3px] accent-[#10b981] cursor-pointer"
                aria-label={`Filtrar por ${metric.label} mínimo`}
              />
              {sliderValue > 0 ? (
                <button
                  type="button"
                  onClick={resetSlider}
                  className="text-[8px] text-orange-400 font-black shrink-0 hover:text-orange-300 transition-colors"
                >
                  ≥{metric.kind === "minutes" ? `${sliderValue}m` : sliderValue} ✕
                </button>
              ) : (
                <span className="text-[8px] text-[var(--text-muted)] font-black shrink-0 w-8 text-right tabular-nums">
                  {metric.kind === "minutes" ? `${Math.ceil(maxVal)}m` : Math.ceil(maxVal)}
                </span>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="h-[60px] flex items-center justify-center text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest border border-dashed border-[var(--border)] rounded-xl">
          Sin datos
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SupportingDataGrid({
  stats,
  activeStat,
  activeStatLabel,
  onFilterChange,
  correlatedMetric,
}: SupportingDataGridProps) {
  const metricConfigs = buildMetrics(activeStat).slice(0, 6);

  const cards = metricConfigs.map((metric) => {
    const series = stats.map((s) => {
      const value = getMetricValue(s, metric);
      return {
        value: value ?? 0,
        label: value === null ? "-" : formatBarLabel(value, metric.kind),
      };
    });

    const realValues = stats
      .map((s) => getMetricValue(s, metric))
      .filter((v): v is number => v !== null && Number.isFinite(v));

    const avg  = realValues.length ? realValues.reduce((sum, v) => sum + v, 0) / realValues.length : null;
    const last = realValues.length ? realValues[realValues.length - 1] : null;
    const Icon = metric.icon;
    const hasData = realValues.length > 0 && realValues.some((v) => v !== 0);
    const isCorrelated = correlatedMetric === metric.id;

    return { metric, series, avg, last, Icon, hasData, isCorrelated };
  });

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-2xl">
      <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between gap-4">
        <div>
          <p className="text-[9px] text-[#10b981] font-black uppercase tracking-[0.25em]">
            Supporting Data
          </p>
          <h3 className="text-[var(--text)] font-black uppercase tracking-tight">
            Contexto para {activeStatLabel}
          </h3>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <p className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">
            L{stats.length}
          </p>
          {onFilterChange && (
            <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest opacity-60">
              arrastrá para filtrar
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-3">
        {cards.map(({ metric, series, avg, last, Icon, hasData, isCorrelated }) => (
          <MetricCard
            key={metric.id}
            metric={metric}
            series={series}
            avg={avg}
            last={last}
            Icon={Icon}
            hasData={hasData}
            isCorrelated={isCorrelated}
            onFilterChange={onFilterChange}
          />
        ))}
      </div>
    </div>
  );
}
