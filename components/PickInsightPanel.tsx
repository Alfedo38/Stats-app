"use client";

import {
  AlertTriangle,
  BadgeCheck,
  Flame,
  ShieldQuestion,
  Timer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { selectionSummary } from "@/lib/selectionStats";
import { getMinutesValue } from "@/lib/playerUtils";
import PlayerLineExplorer from "@/components/PlayerLineExplorer";

// ─── Types ────────────────────────────────────────────────────────────────────

type PickInsightPanelProps = {
  stats: any[];
  lineValue: number;
  activeStatLabel: string;
  hitRate: number;
  hits: number;
  avgValue: string;
  avgMinutes: string;
  lastN: number;
  side?: "over"|"under";
  scope?: string;
  loading?: boolean;
  error?: string|null;
  onSelectLine?: (line: number) => void;
  formatLine?: (line: number) => string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────


function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatNumber(value: number|null) {
  if(value===null)return "S/D";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

// ─── Lean logic ───────────────────────────────────────────────────────────────

type LeanResult = {
  label: string;
  verdict: "over" | "under" | "nobet";
  icon: React.ElementType;
  heroClass: string;          // fondo + borde del hero card
  heroTextClass: string;      // color del texto grande
  badgeClass: string;         // pill pequeño
};

function getLean(hitRate: number, avgValue: number, lineValue: number, side: "over"|"under"="over"): LeanResult {
  const favorableAverage=side==='under'?avgValue<lineValue:avgValue>lineValue;
  if (hitRate >= 65 && favorableAverage) {
    return {
      label: side==='under'?"Lean Under":"Lean Over",
      verdict: side,
      icon: side==='under'?TrendingDown:TrendingUp,
      heroClass: "bg-[#10b981]/10 border-[#10b981]/40",
      heroTextClass: "text-[#10b981]",
      badgeClass: "bg-[#10b981]/15 border-[#10b981]/30 text-[#10b981]",
    };
  }
  if (hitRate <= 35 && !favorableAverage) {
    return {
      label: side==='under'?"Revisar Under":"Revisar Over",
      verdict: "nobet",
      icon: TrendingDown,
      heroClass: "bg-red-500/10 border-red-500/40",
      heroTextClass: "text-red-400",
      badgeClass: "bg-red-500/15 border-red-500/30 text-red-400",
    };
  }
  return {
    label: "No Bet / Revisar",
    verdict: "nobet",
    icon: ShieldQuestion,
    heroClass: "bg-yellow-500/10 border-yellow-500/40",
    heroTextClass: "text-yellow-300",
    badgeClass: "bg-yellow-500/15 border-yellow-500/30 text-yellow-300",
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PickInsightPanel({
  stats,
  lineValue,
  activeStatLabel,
  avgMinutes,
  lastN,
  side="over", scope="FULL", loading=false, error=null,
  onSelectLine, formatLine,
}: PickInsightPanelProps) {
  const safeStats=loading||error?[]:stats;
  const summary=selectionSummary(safeStats.map(s=>s.value),lineValue,side);
  const avg=summary.average,med=summary.median;
  const avgValue=formatNumber(avg),hits=summary.hits;
  const hitRate=summary.rate===null?null:Math.round(summary.rate);
  const last3=safeStats.slice(-3);
  const last3Summary=selectionSummary(last3.map(s=>s.value),lineValue,side);
  const last3Hits=last3Summary.hits;
  const sideLabel=side==='under'?'Under':'Over';
  const unavailable=loading?'Cargando muestra':error?'No se pudo cargar la muestra':summary.rate===null?'Sin muestra para evaluar':null;

  const minuteValues = safeStats
    .map((s) => getMinutesValue(s))
    .filter((v): v is number => v !== null);
  const lowMinuteGames = scope==='FULL'?minuteValues.filter((m) => m < 20).length:0;

  const lean = unavailable||summary.decided<5 ? {...getLean(50,lineValue,lineValue,side),label:unavailable||"Muestra insuficiente"} : getLean(summary.rate!, avg!, lineValue,side);
  const LeanIcon = lean.icon;

  // ── Razones del veredicto ──────────────────────────────────────────────────
  const reasons: { icon: React.ElementType; label: string; ok: boolean }[] = [
    {
      icon: hitRate !== null && hitRate >= 60 ? Flame : (hitRate ?? 50) <= 40 ? TrendingDown : ShieldQuestion,
      label:
        unavailable ? "Sin evaluación" : (hitRate ?? -1) >= 60
          ? "Tendencia positiva"
          : (hitRate ?? 50) <= 40
          ? "Tendencia fría"
          : "Tendencia mixta",
      ok: (hitRate ?? -1) >= 60,
    },
    {
      icon: lowMinuteGames > 0 ? AlertTriangle : Timer,
      label: minuteValues.length===0 ? "Minutos S/D" : minuteValues.length!==safeStats.length ? "Cobertura parcial de MIN" : scope!=="FULL" ? "Minutos del período" : lowMinuteGames > 0 ? `${lowMinuteGames} juego${lowMinuteGames > 1 ? "s" : ""} baja min.` : "Minutos limpios",
      ok: safeStats.length>0 && minuteValues.length===safeStats.length && lowMinuteGames === 0,
    },
    {
      icon: avg!==null&&avg >= lineValue ? BadgeCheck : AlertTriangle,
      label: avg===null ? "AVG S/D" : avg >= lineValue ? "AVG sobre línea" : "AVG bajo línea",
      ok: avg!==null && (side==='under'?avg<lineValue:avg>lineValue),
    },
  ];

  // ── Chips de métricas ──────────────────────────────────────────────────────
  const metricChips = [
    { label: summary.rate===null?"Aciertos S/D":`${hits}/${summary.decided} ${sideLabel}`,   highlight: true },
    { label: `AVG ${avgValue}`,          highlight: false },
    { label: `MED ${formatNumber(med)}`, highlight: false },
    { label: `Últimos ${last3.length}: ${last3Summary.rate===null?"S/D":`${last3Hits}/${last3Summary.decided}`}`, highlight: last3Hits >= 2 },
    { label: `${avgMinutes} MIN prom.`,  highlight: false },
  ];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-2xl">

      {/* ── HERO: Veredicto ────────────────────────────────────────────────── */}
      <div className={`border-b border-[var(--border)] px-5 py-5 ${lean.heroClass}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

          {/* Etiqueta + ícono grande */}
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${lean.heroClass}`}>
              <LeanIcon size={28} className={lean.heroTextClass} />
            </div>
            <div>
              <p className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-[0.25em] mb-0.5">
                Lectura histórica · L{lastN}
              </p>
              <p className={`text-2xl font-black uppercase tracking-tight leading-none ${lean.heroTextClass}`}>
                {lean.label}
              </p>
            </div>
          </div>

          {/* Hit rate grande */}
          <div className="flex items-baseline gap-1 sm:text-right">
            <span className={`text-5xl font-black tabular-nums leading-none ${lean.heroTextClass}`}>
              {hitRate===null?"S/D":hitRate}
            </span>
            <span className="text-lg text-[var(--text-muted)] font-black">{hitRate===null?"":"%"}</span>
            <span className="text-[10px] text-[var(--text-muted)] font-black uppercase ml-1">acierto {sideLabel}</span>
          </div>
        </div>

        {/* Chips de métricas */}
        <div className="flex flex-wrap gap-2 mt-4">
          {metricChips.map((chip) => (
            <span
              key={chip.label}
              className={`text-[10px] font-black px-2.5 py-1 rounded-full border uppercase tracking-wider ${
                chip.highlight
                  ? lean.badgeClass
                  : "bg-[var(--bg)]/40 border-[var(--border)] text-[var(--text-muted)]"
              }`}
            >
              {chip.label}
            </span>
          ))}
        </div>
      </div>

      <PlayerLineExplorer stats={stats} line={lineValue} side={side} marketLabel={activeStatLabel} onSelectLine={onSelectLine} formatLine={formatLine} loading={loading} error={error}/>

      {/* ── Razones del veredicto ──────────────────────────────────────────── */}
      <div className="px-5 py-4">
        <p className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-[0.25em] mb-3">
          Lectura rápida
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {reasons.map((r) => {
            const Icon = r.icon;
            return (
              <div
                key={r.label}
                className="bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl px-3 py-3 flex items-center gap-2 min-w-0"
              >
                <Icon
                  size={14}
                  className={`shrink-0 ${r.ok ? "text-[#10b981]" : "text-red-400"}`}
                />
                <span
                  className={`text-[9px] font-black uppercase tracking-widest truncate ${
                    r.ok ? "text-[#10b981]" : "text-red-400"
                  }`}
                >
                  {r.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Contexto textual */}
        <p className="text-xs text-[#aaa] font-bold leading-relaxed mt-3">
          <span className="text-[var(--text)] font-black">{summary.rate===null?"S/D":`${hits}/${summary.decided}`}</span> {side==='under'?"por debajo de":"por encima de"}{" "}
          <span className="text-[var(--text)] font-black">{lineValue} {activeStatLabel}</span>
          {" · "}
          <span className="text-[#10b981] font-black">{avgMinutes} MIN prom.</span>
          {" · "}
          AVG <span className="text-[var(--text)] font-black">{avgValue}</span>
          {" · "}
          MED <span className="text-[var(--text)] font-black">{formatNumber(med)}</span>
          {" · "}
          Últimos {last3.length}: <span className="text-[var(--text)] font-black">{last3Summary.rate===null?"S/D":`${last3Hits}/${last3Summary.decided}`}</span>
          {summary.pushes>0&&` · ${summary.pushes} empate(s), fuera del porcentaje`}
          {summary.missing>0&&` · ${summary.missing} sin dato`}
        </p>
      </div>
    </div>
  );
}
