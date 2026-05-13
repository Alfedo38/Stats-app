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

type PickInsightPanelProps = {
  stats: any[];
  lineValue: number;
  activeStatLabel: string;
  hitRate: number;
  hits: number;
  avgValue: string;
  avgMinutes: string;
  lastN: number;
};

function getMinutesValue(raw: any) {
  const value =
    raw?.min ??
    raw?.minutes ??
    raw?.mins ??
    raw?.minutos ??
    raw?.minutes_played ??
    raw?.mp ??
    null;

  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "string") {
    if (value.includes(":")) {
      const minutes = Number(value.split(":")[0]);
      return Number.isNaN(minutes) ? null : minutes;
    }
    const parsed = Number(value.replace("m", ""));
    return Number.isNaN(parsed) ? null : parsed;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatNumber(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

function getLean(hitRate: number, avgValue: number, lineValue: number) {
  if (hitRate >= 65 && avgValue >= lineValue) {
    return { label: "Lean Over", color: "text-[#10b981]", icon: TrendingUp };
  }

  if (hitRate <= 35 && avgValue < lineValue) {
    return { label: "Lean Under", color: "text-red-400", icon: TrendingDown };
  }

  return { label: "No Bet / Revisar", color: "text-yellow-300", icon: ShieldQuestion };
}

export default function PickInsightPanel({
  stats,
  lineValue,
  activeStatLabel,
  hitRate,
  hits,
  avgValue,
  avgMinutes,
  lastN,
}: PickInsightPanelProps) {
  const values = stats.map((s) => Number(s.value) || 0);
  const avg = Number(avgValue) || 0;
  const med = median(values);
  const last3 = stats.slice(-3);
  const last3Hits = last3.filter((s) => Number(s.value) >= lineValue).length;
  const minuteValues = stats
    .map((s) => getMinutesValue(s))
    .filter((v): v is number => v !== null);

  const lowMinuteGames = minuteValues.filter((m) => m < 20).length;
  const lean = getLean(hitRate, avg, lineValue);
  const LeanIcon = lean.icon;

  const badges = [
    {
      label:
        hitRate >= 60
          ? "Tendencia positiva"
          : hitRate <= 40
            ? "Tendencia fría"
            : "Tendencia mixta",
      icon: hitRate >= 60 ? Flame : hitRate <= 40 ? TrendingDown : ShieldQuestion,
      color:
        hitRate >= 60
          ? "text-[#10b981]"
          : hitRate <= 40
            ? "text-red-400"
            : "text-yellow-300",
    },
    {
      label: lowMinuteGames > 0 ? `${lowMinuteGames} baja min.` : "Minutos limpios",
      icon: lowMinuteGames > 0 ? AlertTriangle : Timer,
      color: lowMinuteGames > 0 ? "text-yellow-300" : "text-[#10b981]",
    },
    {
      label: avg >= lineValue ? "AVG sobre línea" : "AVG bajo línea",
      icon: avg >= lineValue ? BadgeCheck : AlertTriangle,
      color: avg >= lineValue ? "text-[#10b981]" : "text-red-400",
    },
  ];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-2xl">
      <div className="p-4 md:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[9px] text-[#10b981] font-black uppercase tracking-[0.25em]">
                Lectura rápida
              </p>
              <span className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">
                L{lastN}
              </span>
            </div>

            <p className="text-sm md:text-base text-[#d1d5db] font-bold leading-relaxed max-w-[980px]">
              <span className="text-[var(--text)] font-black">{hits}/{lastN}</span> sobre{" "}
              <span className="text-[var(--text)] font-black">
                {lineValue} {activeStatLabel}
              </span>{" "}
              · <span className="text-[#10b981] font-black">{avgMinutes} MIN prom.</span>{" "}
              · AVG <span className="text-[var(--text)] font-black">{avgValue}</span> · MED{" "}
              <span className="text-[var(--text)] font-black">{formatNumber(med)}</span> · Últimos 3:{" "}
              <span className="text-[var(--text)] font-black">{last3Hits}/3</span>
            </p>
          </div>

          <div className="bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl px-4 py-3 flex items-center gap-2 w-full sm:w-auto sm:min-w-[180px] justify-center lg:justify-start shrink-0">
            <LeanIcon size={17} className={lean.color} />
            <span className={`text-sm font-black uppercase ${lean.color}`}>{lean.label}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {badges.map((badge) => {
            const Icon = badge.icon;
            return (
              <div
                key={badge.label}
                className="bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl px-3 py-3 flex items-center gap-2 min-w-0"
              >
                <Icon size={14} className={`${badge.color} shrink-0`} />
                <span className={`text-[9px] font-black uppercase tracking-widest truncate ${badge.color}`}>
                  {badge.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}