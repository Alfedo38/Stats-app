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
import { useEffect, useState } from "react";
import { formatMinutes, formatNumber } from "@/lib/formatters";

// ─── Types ────────────────────────────────────────────────────────────────────

type SupportingDataGridProps = {
  stats: any[];
  activeStat: string;
  activeStatLabel: string;
  onFilterChange?: (metricId: string, label: string, minValue: number | null) => void;
  correlatedMetric?: string;
  resetToken?: number;
};

type MetricConfig = {
  id: string;
  label: string;
  keys: string[];
  kind?: "number" | "percent" | "minutes";
  icon: any;
  group?: "context" | "role" | "volume" | "opportunity" | "efficiency" | "risk";
};

// ─── Metric configs ───────────────────────────────────────────────────────────

const COMMON_METRICS: MetricConfig[] = [
  { id: "minutes",   label: "Min",    keys: ["min_clean","minutes_clean","min","minutes","mins","minutes_played","mp"], kind: "minutes", icon: Timer, group: "context" },
  { id: "usage_pct", label: "Usage",  keys: ["usage_pct","usg_pct"], kind: "percent", icon: Gauge, group: "role" },
  { id: "touches",   label: "Toques", keys: ["touches"], icon: MousePointer2, group: "role" },
];

const METRICS_BY_STAT: Record<string, MetricConfig[]> = {
  pts: [
    ...COMMON_METRICS,
    { id: "fga",     label: "FGA",  keys: ["fga"],            icon: Activity, group: "volume" },
    { id: "fgm",     label: "FGM",  keys: ["fgm"],            icon: TrendingUp, group: "volume" },
    { id: "fg3a",    label: "3PA",  keys: ["fg3a"],           icon: Eye, group: "volume" },
    { id: "fg3m",    label: "3PTM", keys: ["fg3m"],           icon: TrendingUp, group: "volume" },
    { id: "ftm",     label: "FTM",  keys: ["ftm"],            icon: Activity, group: "volume" },
    { id: "fg_pct",  label: "FG%",  keys: ["fg_pct"],         kind: "percent", icon: Gauge, group: "efficiency" },
  ],
  ast: [
    ...COMMON_METRICS,
    { id: "potential_ast", label: "Pot AST", keys: ["potential_ast","pot_ast"], icon: GitMerge, group: "opportunity" },
    { id: "passes_made",   label: "Pases",   keys: ["passes_made"],            icon: Activity, group: "role" },
    { id: "ast",           label: "AST",     keys: ["ast"],                    icon: TrendingUp, group: "opportunity" },
    { id: "fga",           label: "FGA",     keys: ["fga"],                    icon: Eye, group: "volume" },
  ],
  reb: [
    ...COMMON_METRICS,
    { id: "rebound_chances", label: "REB CH", keys: ["rebound_chances","reb_chances"], icon: Eye, group: "opportunity" },
    { id: "reb",             label: "REB",    keys: ["reb"],                           icon: TrendingUp, group: "opportunity" },
    { id: "oreb",            label: "OREB",   keys: ["oreb"],                          icon: TrendingUp, group: "opportunity" },
    { id: "dreb",            label: "DREB",   keys: ["dreb"],                          icon: TrendingDown, group: "opportunity" },
  ],
  fg3m: [
    ...COMMON_METRICS,
    { id: "fg3a",    label: "3PA",  keys: ["fg3a"],    icon: Eye, group: "volume" },
    { id: "fg3m",    label: "3PTM", keys: ["fg3m"],    icon: TrendingUp, group: "volume" },
    { id: "fg3_pct", label: "3P%",  keys: ["fg3_pct"], kind: "percent", icon: Gauge, group: "efficiency" },
    { id: "fga",     label: "FGA",  keys: ["fga"],     icon: Activity, group: "volume" },
  ],
  fg3a: [
    ...COMMON_METRICS,
    { id: "fg3a", label: "3PA",  keys: ["fg3a"], icon: Eye, group: "volume" },
    { id: "fg3m", label: "3PTM", keys: ["fg3m"], icon: TrendingUp, group: "volume" },
    { id: "fga",  label: "FGA",  keys: ["fga"],  icon: Activity, group: "volume" },
  ],
  potential_ast: [
    ...COMMON_METRICS,
    { id: "potential_ast", label: "Pot AST", keys: ["potential_ast","pot_ast"], icon: GitMerge, group: "opportunity" },
    { id: "passes_made",   label: "Pases",   keys: ["passes_made"],            icon: Activity, group: "role" },
    { id: "ast",           label: "AST",     keys: ["ast"],                    icon: TrendingUp, group: "opportunity" },
  ],
  rebound_chances: [
    ...COMMON_METRICS,
    { id: "rebound_chances", label: "REB CH", keys: ["rebound_chances","reb_chances"], icon: Eye, group: "opportunity" },
    { id: "reb",             label: "REB",    keys: ["reb"],                           icon: TrendingUp, group: "opportunity" },
    { id: "oreb",            label: "OREB",   keys: ["oreb"],                          icon: TrendingUp, group: "opportunity" },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseValue(raw: any, kind?: MetricConfig["kind"]): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "string" && raw.includes(":")) {
    const minutes = Number(raw.split(":")[0]);
    return Number.isNaN(minutes) ? null : minutes;
  }
  const n = Number(String(raw).replace("m","").replace("%",""));
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
  if (kind === "minutes") return `${formatMinutes(value)}m`;
  if (kind === "percent")  return `${value.toFixed(1)}%`;
  return formatNumber(value, 1);
}

function formatSliderLabel(value: number, kind?: MetricConfig["kind"]): string {
  if (kind === "minutes") return `${formatMinutes(value)}m`;
  if (kind === "percent")  return `${value}%`;
  return formatNumber(value, 1);
}

function buildMetrics(activeStat: string): MetricConfig[] {
  if (activeStat.includes("ast")) return METRICS_BY_STAT.ast;
  if (activeStat.includes("reb")) return METRICS_BY_STAT.reb;
  if (activeStat === "fg3m" || activeStat === "fg3a") return METRICS_BY_STAT[activeStat];
  return METRICS_BY_STAT[activeStat] || METRICS_BY_STAT.pts;
}

// ─── Trend ────────────────────────────────────────────────────────────────────

type TrendDir = "up" | "down" | "flat";

function getTrend(series: number[]): TrendDir {
  if (series.length < 4) return "flat";
  const recent = series.slice(-3);
  const older  = series.slice(0, Math.ceil(series.length / 2));
  const avgRecent = recent.reduce((a,b)=>a+b,0)/recent.length;
  const avgOlder  = older.reduce((a,b)=>a+b,0)/older.length;
  if (avgOlder === 0) return "flat";
  const pct = ((avgRecent - avgOlder) / avgOlder) * 100;
  if (pct >  6) return "up";
  if (pct < -6) return "down";
  return "flat";
}

function TrendIcon({ dir }: { dir: TrendDir }) {
  if (dir === "up")   return <TrendingUp   size={11} className="text-[#10b981]" />;
  if (dir === "down") return <TrendingDown  size={11} className="text-red-400" />;
  return                     <Minus         size={11} className="text-[var(--text-muted)]" />;
}


type MetricTheme = {
  color: string;
  soft: string;
  border: string;
  label: string;
};

function getMetricTheme(metric: MetricConfig): MetricTheme {
  const group = metric.group || "context";
  if (metric.id === "minutes") return { color: "#22d3ee", soft: "rgba(34,211,238,0.10)", border: "rgba(34,211,238,0.35)", label: "Contexto" };
  if (metric.id === "usage_pct" || metric.id === "touches" || metric.id === "passes_made") return { color: "#a855f7", soft: "rgba(168,85,247,0.10)", border: "rgba(168,85,247,0.35)", label: "Rol" };
  if (["fga","fgm","fg3a","fg3m","ftm","fta"].includes(metric.id)) return { color: "#f97316", soft: "rgba(249,115,22,0.10)", border: "rgba(249,115,22,0.35)", label: "Volumen" };
  if (["fg_pct","fg3_pct"].includes(metric.id)) return { color: "#eab308", soft: "rgba(234,179,8,0.10)", border: "rgba(234,179,8,0.35)", label: "Eficiencia" };
  if (["potential_ast","rebound_chances"].includes(metric.id)) return { color: "#14b8a6", soft: "rgba(20,184,166,0.12)", border: "rgba(20,184,166,0.40)", label: "Oportunidad" };
  if (group === "opportunity") return { color: "#10b981", soft: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.35)", label: "Oportunidad" };
  if (group === "risk") return { color: "#ef4444", soft: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.35)", label: "Riesgo" };
  return { color: "#22d3ee", soft: "rgba(34,211,238,0.10)", border: "rgba(34,211,238,0.35)", label: "Contexto" };
}

// ─── Sparkline SVG ────────────────────────────────────────────────────────────

function Sparkline({
  series,
  avg,
  minFilter,
  isCorrelated,
  color,
  metricId,
}: {
  series: { value: number; label: string }[];
  avg: number | null;
  minFilter: number;
  isCorrelated: boolean;
  color: string;
  metricId: string;
}) {
  if (!series.length) return <div className="h-[58px]" />;

  const W = 200;
  const H = 54;
  const pad = 4;

  const vals = series.map((s) => s.value);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;

  const toX = (i: number) =>
    pad + (i / Math.max(series.length - 1, 1)) * (W - pad * 2);
  const toY = (v: number) =>
    H - pad - ((v - minV) / range) * (H - pad * 2);

  const points = series.map((s, i) => `${toX(i).toFixed(1)},${toY(s.value).toFixed(1)}`);
  const pathD  = `M ${points.join(" L ")}`;
  const areaD  = `M ${toX(0).toFixed(1)},${H} L ${points.join(" L ")} L ${toX(series.length - 1).toFixed(1)},${H} Z`;

  const activeColor = isCorrelated ? "#10b981" : color;
  const fillId = `spk-${metricId.replace(/[^a-z0-9_-]/gi, "")}-${isCorrelated ? "g" : "n"}`;
  const lastI  = series.length - 1;
  const lastFiltered = series[lastI].value < minFilter;

  return (
    <div className="h-[58px] w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={activeColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={activeColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Area bajo la curva */}
        <path d={areaD} fill={`url(#${fillId})`} />

        {/* Línea */}
        <path
          d={pathD}
          fill="none"
          stroke={activeColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Dots de valores filtrados */}
        {series.map((s, i) =>
          s.value < minFilter ? (
            <circle key={i} cx={toX(i)} cy={toY(s.value)} r="2" fill="#ef4444" opacity="0.55" />
          ) : null
        )}

        {/* Línea de promedio punteada */}
        {avg !== null && avg > minV && avg < maxV && (
          <line
            x1={pad} y1={toY(avg).toFixed(1)}
            x2={W - pad} y2={toY(avg).toFixed(1)}
            stroke={activeColor}
            strokeWidth="0.8"
            strokeDasharray="3 3"
            opacity="0.45"
          />
        )}

        {/* Último valor — punto destacado */}
        <circle
          cx={toX(lastI).toFixed(1)}
          cy={toY(series[lastI].value).toFixed(1)}
          r="3.5"
          fill={lastFiltered ? "#ef4444" : activeColor}
          stroke="#111"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

function MetricCard({
  metric,
  series,
  avg,
  last,
  trendDir,
  Icon,
  hasData,
  isCorrelated,
  onFilterChange,
  resetToken = 0,
}: {
  metric: MetricConfig;
  series: { value: number; label: string }[];
  avg: number | null;
  last: number | null;
  trendDir: TrendDir;
  Icon: any;
  hasData: boolean;
  isCorrelated: boolean;
  onFilterChange?: (metricId: string, label: string, minValue: number | null) => void;
  resetToken?: number;
}) {
  const maxVal = Math.ceil(Math.max(0, ...series.map((s) => s.value)));
  const theme = getMetricTheme(metric);
  const accentColor = isCorrelated ? "#10b981" : theme.color;
  const [sliderValue, setSliderValue] = useState(0);
  const sliderPct = maxVal > 0 ? Math.min(100, Math.max(0, (sliderValue / maxVal) * 100)) : 0;

  useEffect(() => {
    setSliderValue(0);
  }, [resetToken]);

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setSliderValue(val);
    if (onFilterChange) {
      const label = `${metric.label} ≥ ${formatSliderLabel(val, metric.kind)}`;
      onFilterChange(metric.id, label, val > 0 ? val : null);
    }
  };

  const resetSlider = () => {
    setSliderValue(0);
    onFilterChange?.(metric.id, metric.label, null);
  };

  const borderStyle = isCorrelated
    ? "border-[#10b981]/45 bg-[#10b981]/[0.055] shadow-[#10b981]/10"
    : "border-[var(--border)] bg-[var(--surface)]";

  return (
    <div
      className={`border rounded-2xl p-4 flex flex-col gap-3 shadow-xl relative overflow-hidden ${borderStyle}`}
      style={{ boxShadow: `0 16px 40px ${theme.soft}` }}
    >
      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border"
            style={{ backgroundColor: theme.soft, borderColor: isCorrelated ? "rgba(16,185,129,0.45)" : theme.border }}
          >
            <Icon size={14} style={{ color: accentColor }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest truncate">
                {metric.label}
              </p>
              {isCorrelated && (
                <span
                  title="Métrica con mayor correlación frente a la prop activa"
                  className="text-[7px] text-[#10b981] font-black uppercase shrink-0 cursor-help"
                >
                  ★
                </span>
              )}
            </div>
            <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: accentColor }}>
              {theme.label}
            </p>
            <p className="text-base text-[var(--text)] font-black tabular-nums leading-none mt-0.5">
              {formatValue(avg, metric.kind)}
              <span className="text-[8px] text-[var(--text-muted)] font-bold ml-1">avg</span>
            </p>
          </div>
        </div>

        {/* Último + tendencia */}
        <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
          <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest">último</p>
          <p className="text-xs font-black tabular-nums" style={{ color: accentColor }}>
            {formatValue(last, metric.kind)}
          </p>
          <TrendIcon dir={trendDir} />
        </div>
      </div>

      {/* Sparkline */}
      {hasData ? (
        <>
          <Sparkline
            series={series}
            avg={avg}
            minFilter={sliderValue}
            isCorrelated={isCorrelated}
            color={theme.color}
            metricId={metric.id}
          />

          {/* Range slider */}
          {onFilterChange && maxVal > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/45 px-2.5 py-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[7px] font-black uppercase tracking-widest" style={{ color: accentColor }}>
                  {theme.label} · Filtro rápido
                </span>
                {sliderValue > 0 ? (
                  <button
                    type="button"
                    onClick={resetSlider}
                    className="text-[8px] text-orange-400 font-black shrink-0 hover:text-orange-300 transition-colors whitespace-nowrap"
                  >
                    ≥ {formatSliderLabel(sliderValue, metric.kind)} ✕
                  </button>
                ) : (
                  <span className="text-[8px] text-[var(--text-muted)] font-black shrink-0 tabular-nums">
                    max {formatSliderLabel(maxVal, metric.kind)}
                  </span>
                )}
              </div>
              <input
                type="range"
                min={0}
                max={maxVal}
                step={metric.kind === "percent" ? 5 : 1}
                value={sliderValue}
                onChange={handleSlider}
                style={{
                  background: `linear-gradient(90deg, ${accentColor} 0%, ${accentColor} ${sliderPct}%, rgba(255,255,255,0.12) ${sliderPct}%, rgba(255,255,255,0.12) 100%)`,
                  accentColor,
                }}
                className="mp-range w-full h-2 rounded-full appearance-none cursor-pointer"
                aria-label={`Filtrar por ${metric.label} mínimo`}
              />
            </div>
          )}
        </>
      ) : (
        <div className="h-[58px] flex items-center justify-center">
          <span className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">
            Sin datos
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function SupportingDataGrid({
  stats,
  activeStat,
  activeStatLabel,
  onFilterChange,
  correlatedMetric,
  resetToken = 0,
}: SupportingDataGridProps) {
  const metrics = buildMetrics(activeStat);

  const cards = metrics.map((metric) => {
    const rawValues = stats
      .map((row) => getMetricValue(row, metric))
      .filter((v): v is number => v !== null);

    const avg  = rawValues.length > 0
      ? rawValues.reduce((a,b) => a + b, 0) / rawValues.length
      : null;

    const last = rawValues.length > 0 ? rawValues[rawValues.length - 1] : null;

    const seriesValues = stats.map((row) => {
      const v = getMetricValue(row, metric);
      return {
        value: v ?? 0,
        label: v !== null ? formatValue(v, metric.kind) : "S/D",
      };
    });

    const trendDir = getTrend(rawValues);
    const hasData  = rawValues.some((v) => v > 0);

    return {
      metric,
      series:   seriesValues,
      avg,
      last,
      trendDir,
      hasData,
      isCorrelated: metric.id === correlatedMetric,
    };
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
      {cards.map(({ metric, series, avg, last, trendDir, hasData, isCorrelated }) => (
        <MetricCard
          key={metric.id}
          metric={metric}
          series={series}
          avg={avg}
          last={last}
          trendDir={trendDir}
          Icon={metric.icon}
          hasData={hasData}
          isCorrelated={isCorrelated}
          onFilterChange={onFilterChange}
          resetToken={resetToken}
        />
      ))}
    </div>
  );
}
