"use client";

import { Activity, Eye, Gauge, GitMerge, MousePointer2, Timer, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatMinutes, formatNumber } from "@/lib/formatters";

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
  description: string;
  keys: string[];
  kind?: "number" | "percent" | "minutes";
  icon: any;
  color: string;
};

const METRICS: Record<string, MetricConfig> = {
  minutes: { id: "minutes", label: "Minutos", description: "Tiempo en cancha", keys: ["min_clean", "minutes_clean", "min", "minutes", "mins", "minutes_played", "mp"], kind: "minutes", icon: Timer, color: "#22d3ee" },
  usage_pct: { id: "usage_pct", label: "Uso", description: "Peso ofensivo", keys: ["usage_pct", "usg_pct"], kind: "percent", icon: Gauge, color: "#a855f7" },
  touches: { id: "touches", label: "Toques", description: "Participación", keys: ["touches"], icon: MousePointer2, color: "#a855f7" },
  fga: { id: "fga", label: "Intentos de campo", description: "Volumen de tiro", keys: ["fga"], icon: Activity, color: "#f97316" },
  potential_ast: { id: "potential_ast", label: "Asist. potenciales", description: "Oportunidades creadas", keys: ["potential_ast", "pot_ast"], icon: GitMerge, color: "#14b8a6" },
  passes_made: { id: "passes_made", label: "Pases", description: "Circulación de balón", keys: ["passes_made"], icon: Activity, color: "#a855f7" },
  ast: { id: "ast", label: "Asistencias", description: "Producción final", keys: ["ast"], icon: TrendingUp, color: "#10b981" },
  rebound_chances: { id: "rebound_chances", label: "Chances de rebote", description: "Oportunidades disponibles", keys: ["rebound_chances", "reb_chances"], icon: Eye, color: "#14b8a6" },
  reb: { id: "reb", label: "Rebotes", description: "Producción final", keys: ["reb"], icon: TrendingUp, color: "#10b981" },
  oreb: { id: "oreb", label: "Reb. ofensivos", description: "Segundas oportunidades", keys: ["oreb"], icon: TrendingUp, color: "#10b981" },
};

function metricIdsForStat(activeStat: string) {
  const stat = String(activeStat || "").toLowerCase();
  if (stat.includes("ast")) return ["minutes", "potential_ast", "passes_made", "ast"];
  if (stat.includes("reb")) return ["minutes", "rebound_chances", "reb", "oreb"];
  return ["minutes", "usage_pct", "touches", "fga"];
}

function parseValue(raw: any, kind?: MetricConfig["kind"]): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "string" && raw.includes(":")) {
    const [minutes, seconds = "0"] = raw.split(":");
    const value = Number(minutes) + Number(seconds) / 60;
    return Number.isFinite(value) ? value : null;
  }
  const value = Number(String(raw).replace("m", "").replace("%", ""));
  if (!Number.isFinite(value)) return null;
  if (kind === "percent" && value > 0 && value <= 1) return value * 100;
  return value;
}

function metricValue(row: any, metric: MetricConfig): number | null {
  for (const key of metric.keys) {
    const value = parseValue(row?.[key], metric.kind);
    if (value !== null) return value;
  }
  return null;
}

function displayValue(value: number | null, kind?: MetricConfig["kind"]) {
  if (value === null) return "S/D";
  if (kind === "minutes") return `${formatMinutes(value)}m`;
  if (kind === "percent") return `${value.toFixed(1)}%`;
  return formatNumber(value, 1);
}

export default function SupportingDataGrid({ stats, activeStat, activeStatLabel, onFilterChange, correlatedMetric, resetToken = 0 }: SupportingDataGridProps) {
  const [activeThresholds, setActiveThresholds] = useState<Record<string, number>>({});

  useEffect(() => setActiveThresholds({}), [resetToken, activeStat]);

  const cards = useMemo(() => metricIdsForStat(activeStat).map((id) => {
    const metric = METRICS[id];
    const values = stats.map((row) => metricValue(row, metric)).filter((value): value is number => value !== null);
    const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const latest = values.length ? values[values.length - 1] : null;
    const maximum = values.length ? Math.max(...values) : null;
    const coverage = stats.length ? Math.round((values.length / stats.length) * 100) : 0;
    const inconsistentPotential = id === "potential_ast" && stats.some((row) => {
      const potential = metricValue(row, metric);
      const assists = metricValue(row, METRICS.ast);
      return potential !== null && assists !== null && potential < assists;
    });
    return { metric, average, latest, maximum, coverage, inconsistentPotential };
  }), [activeStat, stats]);

  const toggleAverageFilter = (metric: MetricConfig, average: number | null, invalid: boolean) => {
    if (!onFilterChange || average === null || invalid) return;
    const isActive = activeThresholds[metric.id] !== undefined;
    const threshold = Number(average.toFixed(metric.kind === "percent" ? 0 : 1));
    setActiveThresholds((current) => {
      const next = { ...current };
      if (isActive) delete next[metric.id];
      else next[metric.id] = threshold;
      return next;
    });
    onFilterChange(metric.id, `${metric.label} ≥ ${displayValue(threshold, metric.kind)}`, isActive ? null : threshold);
  };

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 md:p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#10b981]">Contexto de la apuesta</p>
          <h3 className="text-sm font-black uppercase text-[var(--text)]">Oportunidad y producción · {activeStatLabel}</h3>
        </div>
        <p className="text-[9px] font-bold text-[var(--text-muted)]">Promedio y último partido · {stats.length} juegos</p>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ metric, average, latest, maximum, coverage, inconsistentPotential }) => {
          const Icon = metric.icon;
          const isCorrelated = metric.id === correlatedMetric;
          const filterActive = activeThresholds[metric.id] !== undefined;
          const barWidth = average !== null && maximum !== null && maximum > 0 ? Math.min(100, Math.max(0, (average / maximum) * 100)) : 0;

          return (
            <article key={metric.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/65 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border" style={{ color: metric.color, borderColor: `${metric.color}55`, background: `${metric.color}12` }}>
                    <Icon size={14} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[9px] font-black uppercase tracking-wider text-[var(--text)]">{metric.label}</p>
                    <p className="truncate text-[8px] font-bold text-[var(--text-muted)]">{metric.description}</p>
                  </div>
                </div>
                {isCorrelated && <span className="rounded-full bg-[#10b981]/10 px-2 py-1 text-[7px] font-black uppercase text-[#10b981]">Relacionada</span>}
              </div>

              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[7px] font-black uppercase tracking-widest text-[var(--text-muted)]">Promedio</p>
                  <p className="text-xl font-black tabular-nums text-[var(--text)]">{displayValue(average, metric.kind)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[7px] font-black uppercase tracking-widest text-[var(--text-muted)]">Último</p>
                  <p className="text-sm font-black tabular-nums" style={{ color: metric.color }}>{displayValue(latest, metric.kind)}</p>
                </div>
              </div>

              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" aria-label={`Promedio relativo de ${metric.label}`}>
                <div className="h-full rounded-full transition-all" style={{ width: `${barWidth}%`, background: metric.color }} />
              </div>

              <div className="mt-2 flex min-h-6 items-center justify-between gap-2">
                {inconsistentPotential ? (
                  <span className="rounded-lg border border-yellow-400/25 bg-yellow-400/10 px-2 py-1 text-[8px] font-black uppercase text-yellow-300">Dato en revisión</span>
                ) : (
                  <span className="text-[8px] font-bold text-[var(--text-muted)]">Cobertura {coverage}%</span>
                )}
                {onFilterChange && average !== null && !inconsistentPotential && (
                  <button type="button" onClick={() => toggleAverageFilter(metric, average, inconsistentPotential)} className={`rounded-lg border px-2 py-1 text-[8px] font-black uppercase transition ${filterActive ? "border-orange-400/40 bg-orange-400/10 text-orange-300" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
                    {filterActive ? "Quitar filtro" : "Filtrar ≥ prom."}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
