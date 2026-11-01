"use client";

import { Activity, Eye, Gauge, GitMerge, MousePointer2, Timer, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EVIDENCE_METRICS, evidenceMetricIds, summarizeEvidence, evidenceMissingText, type EvidenceMetric } from "@/lib/marketEvidence";
import type { PeriodScope } from "@/lib/nbaPeriodStats";
import { formatDateOnly, formatMinutes, formatNumber } from "@/lib/formatters";

type SupportingDataGridProps = {
  stats: any[];
  activeStat: string;
  activeStatLabel: string;
  onFilterChange?: (metricId: string, label: string, minValue: number | null) => void;
  correlatedMetric?: string;
  resetToken?: number;
  scope?: PeriodScope;
  sampleLabel?: string;
  loading?: boolean;
  error?: string|null;
};

type MetricConfig = EvidenceMetric;
const METRIC_ICONS:Record<string,any>={minutes:Timer,potential_ast:GitMerge,rebound_chances:Eye,usage_pct:Gauge,touches:MousePointer2};

function displayValue(value: number | null, kind?: MetricConfig["kind"]) {
  if (value === null) return "S/D";
  if (kind === "minutes") return `${formatMinutes(value)}m`;
  if (kind === "percent") return `${value.toFixed(1)}%`;
  return formatNumber(value, 1);
}

export default function SupportingDataGrid({ stats, activeStat, activeStatLabel, onFilterChange, correlatedMetric, resetToken = 0, scope="FULL", sampleLabel, loading=false, error=null }: SupportingDataGridProps) {
  const [activeThresholds, setActiveThresholds] = useState<Record<string, number>>({});

  useEffect(() => setActiveThresholds({}), [resetToken, activeStat]);

  const cards = useMemo(() => evidenceMetricIds(activeStat).map(id=>summarizeEvidence(loading||error?[]:stats,EVIDENCE_METRICS[id],scope)),[activeStat,stats,scope,loading,error]);

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
        <p className="text-[9px] font-bold text-[var(--text-muted)]">{loading?"Cargando muestra…":error?"No se pudo cargar la muestra":`Promedio y último encuentro · ${sampleLabel||`${stats.length} PJ`} · ${scope==='FULL'?'Partido completo':scope}` }</p>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const {metric,average,latest,maximum,count,total,invalid,latestDate}=card;
          const inconsistentPotential=invalid>0;
          const Icon = METRIC_ICONS[metric.id] || (metric.numerator?TrendingUp:Activity);
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
                  <p className="text-[7px] font-black uppercase tracking-widest text-[var(--text-muted)]">{metric.numerator?"Conversión observada":"Promedio"}</p>
                  <p className="text-xl font-black tabular-nums text-[var(--text)]">{displayValue(average, metric.kind)}</p>
                </div>
                <div className="text-right" title={latestDate?`Último partido: ${formatDateOnly(latestDate,{year:true})}`:undefined}>
                  <p className="text-[7px] font-black uppercase tracking-widest text-[var(--text-muted)]">Último</p>
                  <p className="text-sm font-black tabular-nums" style={{ color: metric.color }}>{displayValue(latest, metric.kind)}</p>
                </div>
              </div>

              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" aria-label={`Promedio relativo de ${metric.label}`}>
                <div className="h-full rounded-full transition-all" style={{ width: `${barWidth}%`, background: metric.color }} />
              </div>

              <div className="mt-2 flex min-h-6 items-center justify-between gap-2">
                <span className="text-[8px] font-bold text-[var(--text-muted)]">{count}/{total} PJ{metric.numerator?' · mismos partidos':''}</span>
                {onFilterChange && average !== null && !inconsistentPotential && !metric.numerator && metric.kind!=="percent" && !(metric.id==="minutes"&&scope!=="FULL") && (
                  <button type="button" onClick={() => toggleAverageFilter(metric, average, inconsistentPotential)} className={`rounded-lg border px-2 py-1 text-[8px] font-black uppercase transition ${filterActive ? "border-orange-400/40 bg-orange-400/10 text-orange-300" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
                    {filterActive ? "Quitar filtro" : "Filtrar ≥ prom."}
                  </button>
                )}
              </div>
              {!loading&&!error&&evidenceMissingText(card,scope)&&<p className="mt-1 text-[8px] leading-4 text-[var(--text-muted)]">{evidenceMissingText(card,scope)}</p>}
              {metric.numerator&&average!==null&&<p className="mt-1 text-[8px] leading-4 text-[var(--text-muted)]">{card.numerator}/{card.denominator} registrados; ratio acumulado, no probabilidad de acertar la línea.</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
