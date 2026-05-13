"use client";

import {
  Activity,
  Eye,
  Gauge,
  GitMerge,
  MousePointer2,
  Timer,
  TrendingUp,
} from "lucide-react";

type SupportingDataGridProps = {
  stats: any[];
  activeStat: string;
  activeStatLabel: string;
};

type MetricConfig = {
  id: string;
  label: string;
  keys: string[];
  kind?: "number" | "percent" | "minutes";
  icon: any;
};

const COMMON_METRICS: MetricConfig[] = [
  {
    id: "minutes",
    label: "Min",
    keys: ["min", "minutes", "mins", "minutes_played", "mp"],
    kind: "minutes",
    icon: Timer,
  },
  { id: "usage_pct", label: "Usage", keys: ["usage_pct", "usg_pct"], kind: "percent", icon: Gauge },
  { id: "touches", label: "Toques", keys: ["touches"], icon: MousePointer2 },
];

const METRICS_BY_STAT: Record<string, MetricConfig[]> = {
  pts: [
    ...COMMON_METRICS,
    { id: "fga", label: "FGA", keys: ["fga"], icon: Activity },
    { id: "fgm", label: "FGM", keys: ["fgm"], icon: TrendingUp },
    { id: "fg3a", label: "3PA", keys: ["fg3a"], icon: Eye },
  ],
  ast: [
    ...COMMON_METRICS,
    { id: "potential_ast", label: "Pot AST", keys: ["potential_ast", "pot_ast"], icon: GitMerge },
    { id: "passes_made", label: "Pases", keys: ["passes_made"], icon: Activity },
    { id: "ast", label: "AST", keys: ["ast"], icon: TrendingUp },
  ],
  reb: [
    ...COMMON_METRICS,
    { id: "rebound_chances", label: "REB CH", keys: ["rebound_chances", "reb_chances"], icon: Eye },
    { id: "reb", label: "REB", keys: ["reb"], icon: TrendingUp },
    { id: "oreb", label: "OREB", keys: ["oreb"], icon: TrendingUp },
  ],
  fg3m: [
    ...COMMON_METRICS,
    { id: "fg3a", label: "3PA", keys: ["fg3a"], icon: Eye },
    { id: "fg3m", label: "3PTM", keys: ["fg3m"], icon: TrendingUp },
    { id: "fg3_pct", label: "3P%", keys: ["fg3_pct"], kind: "percent", icon: Gauge },
  ],
  fg3a: [
    ...COMMON_METRICS,
    { id: "fg3a", label: "3PA", keys: ["fg3a"], icon: Eye },
    { id: "fg3m", label: "3PTM", keys: ["fg3m"], icon: TrendingUp },
  ],
  potential_ast: [
    ...COMMON_METRICS,
    { id: "potential_ast", label: "Pot AST", keys: ["potential_ast", "pot_ast"], icon: GitMerge },
    { id: "passes_made", label: "Pases", keys: ["passes_made"], icon: Activity },
    { id: "ast", label: "AST", keys: ["ast"], icon: TrendingUp },
  ],
  rebound_chances: [
    ...COMMON_METRICS,
    { id: "rebound_chances", label: "REB CH", keys: ["rebound_chances", "reb_chances"], icon: Eye },
    { id: "reb", label: "REB", keys: ["reb"], icon: TrendingUp },
  ],
};

function parseValue(raw: any, kind?: MetricConfig["kind"]) {
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

function getMetricValue(row: any, metric: MetricConfig) {
  for (const key of metric.keys) {
    const parsed = parseValue(row?.[key], metric.kind);
    if (parsed !== null) return parsed;
  }
  return null;
}

function formatValue(value: number | null, kind?: MetricConfig["kind"]) {
  if (value === null) return "S/D";
  if (kind === "minutes") return `${Math.round(value)}m`;
  if (kind === "percent") return `${value.toFixed(1)}%`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatBarLabel(value: number, kind?: MetricConfig["kind"]) {
  if (kind === "minutes") return `${Math.round(value)}`;
  if (kind === "percent") return `${Math.round(value)}`;
  if (Math.abs(value) >= 100) return `${Math.round(value)}`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildMetrics(activeStat: string) {
  if (activeStat.includes("ast")) return METRICS_BY_STAT.ast;
  if (activeStat.includes("reb")) return METRICS_BY_STAT.reb;
  if (activeStat === "fg3m" || activeStat === "fg3a") return METRICS_BY_STAT[activeStat];
  return METRICS_BY_STAT[activeStat] || METRICS_BY_STAT.pts;
}

function MiniBarStrip({
  series,
  avg,
}: {
  series: { value: number; label: string }[];
  avg: number | null;
}) {
  const max = Math.max(1, ...series.map((item) => item.value));
  const floor = 24;
  const ceiling = 62;

  return (
    <div className="h-[70px] flex items-end gap-1.5 overflow-hidden">
      {series.map((item, index) => {
        const normalized = item.value <= 0 ? 0 : item.value / max;
        const height = item.value <= 0 ? 18 : Math.max(floor, Math.round(normalized * ceiling));
        const isStrong = avg === null ? item.value > 0 : item.value >= avg;

        return (
          <div key={`${item.label}-${index}`} className="flex-1 min-w-0 h-full flex items-end">
            <div
              title={item.label}
              className={`w-full rounded-t-md flex items-start justify-center pt-1 overflow-hidden ${
                isStrong ? "bg-[#10b981]" : "bg-[#374151]"
              }`}
              style={{ height }}
            >
              <span
                className={`text-[8px] leading-none font-black tabular-nums truncate px-[1px] ${
                  isStrong ? "text-black" : "text-[var(--text)]"
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

export default function SupportingDataGrid({
  stats,
  activeStat,
  activeStatLabel,
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

    const avg = realValues.length ? realValues.reduce((sum, v) => sum + v, 0) / realValues.length : null;
    const last = realValues.length ? realValues[realValues.length - 1] : null;
    const Icon = metric.icon;
    const hasData = realValues.length > 0 && realValues.some((v) => v !== 0);

    return { metric, series, avg, last, Icon, hasData };
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
        <p className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest text-right">
          L{stats.length}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-3">
        {cards.map(({ metric, series, avg, last, Icon, hasData }) => (
          <div
            key={metric.id}
            className="bg-[var(--bg)]/45 border border-[var(--border)] rounded-2xl p-3 min-h-[128px]"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-[#10b981]/10 border border-[#10b981]/25 flex items-center justify-center shrink-0">
                  <Icon size={14} className="text-[#10b981]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest truncate">
                    {metric.label}
                  </p>
                  <p className="text-base text-[var(--text)] font-black tabular-nums leading-none mt-1">
                    {formatValue(avg, metric.kind)}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest">
                  último
                </p>
                <p className="text-[#10b981] text-xs font-black tabular-nums">
                  {formatValue(last, metric.kind)}
                </p>
              </div>
            </div>

            {hasData ? (
              <MiniBarStrip series={series} avg={avg} />
            ) : (
              <div className="h-[70px] flex items-center justify-center text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest border border-dashed border-[var(--border)] rounded-xl">
                Sin datos
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}