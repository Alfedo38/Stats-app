"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, MousePointerClick, Target, XCircle } from "lucide-react";

type StakeOdd = {
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

type AltLinesPanelProps = {
  values: number[];
  currentLine: number;
  statId?: string;
  statLabel: string;
  onSelectLine: (line: number) => void;
  stakeOdds?: StakeOdd[];
  primaryStakeOdd?: StakeOdd | null;
  playerName?: string;
};

type AltLineRow = {
  line: number;
  hits: number;
  total: number;
  rate: number;
  isCurrent: boolean;
};

const INTEGER_LINE_STATS = new Set([
  "usage_pct",
  "potential_ast",
  "rebound_chances",
  "touches",
  "passes_made",
]);

function usesIntegerLine(statId: string) {
  return INTEGER_LINE_STATS.has(statId.toLowerCase());
}

function normalizeHalfLine(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0.5, Math.floor(value) + 0.5);
}

function normalizeIntegerLine(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function normalizeLine(value: number, statId: string) {
  return usesIntegerLine(statId) ? normalizeIntegerLine(value) : normalizeHalfLine(value);
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
  return Number(value).toFixed(digits);
}

function formatLineValue(value: number, statId: string) {
  if (usesIntegerLine(statId)) return String(Math.round(value));
  return Number(value).toFixed(1);
}

function formatLineLabel(value: number, statId: string, statLabel: string) {
  const stat = statId.toLowerCase();

  if (stat === "usage_pct") return `${Math.round(value)}% USG`;
  if (usesIntegerLine(statId)) return `${Math.round(value)} ${statLabel}`;
  return `${value.toFixed(1)} ${statLabel}`;
}

function getColor(rate: number) {
  if (rate >= 70) return "text-[#10b981] border-[#10b981]/35 bg-[#10b981]/10";
  if (rate >= 50) return "text-yellow-300 border-yellow-300/35 bg-yellow-300/10";
  return "text-red-400 border-red-400/35 bg-red-400/10";
}

function getBreakEven(odds: number | null | undefined) {
  const n = Number(odds);
  if (!Number.isFinite(n) || n <= 0) return null;
  return (1 / n) * 100;
}

function getAltStep(statId: string, avg: number) {
  const stat = statId.toLowerCase();

  if (stat === "touches" || stat === "passes_made") return 2;
  if (stat === "usage_pct") return 1;
  if (stat === "potential_ast" || stat === "rebound_chances") return 1;
  if (stat.includes("pra")) return 2;
  if (stat.includes("p+r") || stat.includes("p+a") || stat.includes("r+a")) return 2;
  if (stat.includes("pts") && avg >= 20) return 2;

  return 1;
}

function getCandidateFloor(statId: string, avg: number, currentLine: number) {
  const stat = statId.toLowerCase();

  if (usesIntegerLine(stat)) {
    if (stat === "touches" || stat === "passes_made") return Math.max(0, Math.round(Math.min(avg, currentLine) - 6));
    if (stat === "usage_pct") return Math.max(0, Math.round(Math.min(avg, currentLine) - 4));
    return Math.max(0, Math.round(Math.min(avg, currentLine) - 4));
  }

  if (stat === "fg3m") return 0.5;
  if (stat.includes("ast")) return Math.max(0.5, normalizeHalfLine(Math.min(avg, currentLine) - 3));
  if (stat.includes("reb")) return Math.max(1.5, normalizeHalfLine(Math.min(avg, currentLine) - 3));
  if (stat.includes("pts")) return Math.max(5.5, normalizeHalfLine(Math.min(avg, currentLine) - 4));
  if (stat.includes("pra")) return Math.max(10.5, normalizeHalfLine(Math.min(avg, currentLine) - 8));
  if (stat.includes("p+r") || stat.includes("p+a") || stat.includes("r+a")) return Math.max(6.5, normalizeHalfLine(Math.min(avg, currentLine) - 6));

  return Math.max(0.5, normalizeHalfLine(Math.min(avg, currentLine) - 3));
}

function buildAltLines(values: number[], currentLine: number, statId = ""): AltLineRow[] {
  const cleanValues = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (!cleanValues.length) return [];

  const avg = cleanValues.reduce((sum, v) => sum + v, 0) / cleanValues.length;
  const safeCurrent = normalizeLine(Number.isFinite(currentLine) ? currentLine : avg, statId);
  const step = getAltStep(statId, avg);
  const floorLine = getCandidateFloor(statId, avg, safeCurrent);
  const ceilingLine = Math.max(safeCurrent, avg, Math.max(...cleanValues)) + step * 2;
  const candidates = new Set<number>();

  for (let offset = -3; offset <= 3; offset += 1) {
    candidates.add(normalizeLine(safeCurrent + offset * step, statId));
  }

  [avg - step, avg, avg + step].forEach((raw) => candidates.add(normalizeLine(raw, statId)));

  const rows = Array.from(candidates)
    .filter((line) => Number.isFinite(line) && line >= floorLine && line <= ceilingLine)
    .sort((a, b) => a - b)
    .map((line) => {
      const hits = cleanValues.filter((v) => v >= line).length;
      const rate = cleanValues.length ? Math.round((hits / cleanValues.length) * 100) : 0;

      return {
        line,
        hits,
        total: cleanValues.length,
        rate,
        isCurrent: Math.abs(line - safeCurrent) < 0.001,
      };
    });

  const currentIndex = rows.findIndex((row) => row.isCurrent);
  if (rows.length <= 5 || currentIndex === -1) return rows.slice(0, 5);

  const start = Math.max(0, Math.min(currentIndex - 2, rows.length - 5));
  return rows.slice(start, start + 5);
}

function buildOddRows(stakeOdds: StakeOdd[] | undefined, values: number[], statId: string, currentLine: number) {
  const cleanValues = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));

  return (stakeOdds || [])
    .filter((odd) => odd?.line !== null && odd?.line !== undefined)
    .map((odd) => {
      const line = Number(odd.line);
      const hits = cleanValues.filter((v) => v >= line).length;
      const rate = cleanValues.length ? Math.round((hits / cleanValues.length) * 100) : 0;

      return {
        ...odd,
        line,
        hits,
        total: cleanValues.length,
        rate,
        isCurrent: Math.abs(line - currentLine) < 0.001,
        // La misma línea puede venir repetida por book/source o por snapshots cercanos.
        // No usamos esto como React key final porque puede duplicarse.
        normalizedKey: `${formatLineValue(line, statId)}-${odd.prop_type}`,
      };
    })
    .sort((a, b) => a.line - b.line);
}

function StakeOddsRows({
  rows,
  statId,
  statLabel,
  onSelectLine,
}: {
  rows: ReturnType<typeof buildOddRows>;
  statId: string;
  statLabel: string;
  onSelectLine: (line: number) => void;
}) {
  if (!rows.length) return null;

  return (
    <div className="p-3 border-b border-[var(--border)] space-y-2">
      <div className="flex items-center justify-between px-1 pb-1">
        <p className="text-[8px] text-[#10b981] font-black uppercase tracking-[0.22em]">
          Líneas reales Stake
        </p>
        <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-[0.22em]">
          {rows.length} línea{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className={rows.length > 3 ? "space-y-2 max-h-[360px] overflow-y-auto pr-1" : "space-y-2"}>
        {rows.map((odd, index) => {
          const overBE = getBreakEven(odd.over_price);
          const underBE = getBreakEven(odd.under_price);

          return (
            <button
              type="button"
              key={`${odd.normalizedKey}-${odd.book || "stake"}-${odd.source || "src"}-${odd.over_price ?? "noO"}-${odd.under_price ?? "noU"}-${index}`}
              onClick={() => onSelectLine(odd.line)}
              className={`w-full text-left rounded-2xl border p-3 transition-all ${
                odd.isCurrent
                  ? "border-[#10b981]/70 bg-[#10b981]/10"
                  : "border-[var(--border)] bg-[var(--bg)]/45 hover:border-[#10b981]/50 hover:bg-[#10b981]/10"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[var(--text)] text-lg font-black uppercase tabular-nums leading-none">
                    {formatLineValue(odd.line, statId)} {statLabel}
                  </p>
                  <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-1">
                    {odd.hits}/{odd.total} overs · HR {odd.rate}%
                  </p>
                </div>

                <div className="text-right">
                  {odd.isCurrent && (
                    <p className="text-[8px] text-[#10b981] font-black uppercase tracking-widest mb-1">
                      actual
                    </p>
                  )}
                  {!odd.isCurrent && (
                    <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest mb-1">
                      usar
                    </p>
                  )}
                  <p className={`text-xl font-black tabular-nums ${odd.rate >= 50 ? "text-[#10b981]" : "text-red-400"}`}>
                    {odd.rate}%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/45 p-2.5">
                  <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest">Over</p>
                  <p className="text-[var(--text)] text-base font-black tabular-nums">{formatNumber(odd.over_price)}</p>
                  <p className="text-[8px] text-[#777] font-black uppercase tracking-widest">
                    BE {overBE == null ? "-" : `${overBE.toFixed(1)}%`}
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/45 p-2.5">
                  <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest">Under</p>
                  <p className="text-[var(--text)] text-base font-black tabular-nums">{formatNumber(odd.under_price)}</p>
                  <p className="text-[8px] text-[#777] font-black uppercase tracking-widest">
                    BE {underBE == null ? "-" : `${underBE.toFixed(1)}%`}
                  </p>
                </div>
              </div>

              {odd.matchup && (
                <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-2 truncate">
                  {odd.matchup}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AltLinesPanel({
  values,
  currentLine,
  statId = "",
  statLabel,
  onSelectLine,
  stakeOdds = [],
}: AltLinesPanelProps) {
  const [showHistorical, setShowHistorical] = useState(false);

  const realRows = buildOddRows(stakeOdds, values, statId, currentLine);
  const historicalRows = buildAltLines(values, currentLine, statId);
  const hasStakeOdds = realRows.length > 0;
  const shouldShowHistorical = !hasStakeOdds || showHistorical;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-2xl h-full">
      <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3">
        <div>
          <p className="text-[9px] text-[#10b981] font-black uppercase tracking-[0.25em]">
            {hasStakeOdds ? "Stake Odds" : "Alt Lines"}
          </p>
          <h3 className="text-[var(--text)] font-black uppercase tracking-tight">
            {hasStakeOdds ? `Real · ${statLabel}` : `Histórico · ${statLabel}`}
          </h3>
        </div>
        <Target size={17} className="text-red-500" />
      </div>

      {hasStakeOdds && (
        <StakeOddsRows
          rows={realRows}
          statId={statId}
          statLabel={statLabel}
          onSelectLine={onSelectLine}
        />
      )}

      {hasStakeOdds && (
        <button
          type="button"
          onClick={() => setShowHistorical((prev) => !prev)}
          className="w-full px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3 hover:bg-white/[0.03] transition-colors"
        >
          <div className="text-left">
            <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-[0.22em]">
              Rangos históricos
            </p>
            <p className="text-[8px] text-[#777] font-black uppercase tracking-[0.18em]">
              Contexto solamente · No son cuotas
            </p>
          </div>
          <div className="flex items-center gap-2 text-[#10b981]">
            <span className="text-[9px] font-black uppercase tracking-widest">
              {showHistorical ? "Ocultar" : "Ver"}
            </span>
            {showHistorical ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </div>
        </button>
      )}

      {shouldShowHistorical && (
        <div className="p-3 space-y-1.5 max-h-[260px] overflow-y-auto">
          {!hasStakeOdds && (
            <div className="flex items-center justify-between px-1 pb-1">
              <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-[0.22em]">
                Modo histórico
              </p>
            </div>
          )}

          {historicalRows.map((row) => (
            <button
              key={row.line}
              onClick={() => onSelectLine(row.line)}
              className={`w-full group flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-all hover:border-[#10b981]/60 hover:bg-[#10b981]/10 ${
                row.isCurrent ? "border-[#10b981]/70 bg-[#10b981]/10" : "border-[var(--border)] bg-[var(--surface-soft)]"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${getColor(row.rate)}`}>
                  {row.rate >= 50 ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                </div>

                <div className="text-left min-w-0">
                  <p className="text-[var(--text)] text-sm font-black tabular-nums leading-none truncate">
                    {formatLineLabel(row.line, statId, statLabel)}
                  </p>
                  <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-1">
                    {row.hits}/{row.total} partidos
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {row.isCurrent && (
                  <span className="hidden md:inline text-[8px] text-[#10b981] font-black uppercase tracking-widest">
                    elegido
                  </span>
                )}
                <span className={`text-lg font-black tabular-nums ${row.rate >= 50 ? "text-[#10b981]" : "text-red-400"}`}>
                  {row.rate}%
                </span>
                <MousePointerClick size={13} className="text-[var(--text-muted)] group-hover:text-[#10b981]" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}