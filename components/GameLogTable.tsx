"use client";

import { useState, useMemo } from "react";
import { Table2, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type GameLogStat = {
  game_id?: string | number;
  game_date: string;
  matchup?: string;
  value: number;
  is_percentage?: boolean;
  game_result?: "W" | "L" | null;   // optional — renders if present
  game_score?: string | null;        // e.g. "112-108" — optional
  // minutes — any of these keys
  min?: any; minutes?: any; mins?: any; minutos?: any;
  minutes_played?: any; mp?: any; period_minutes?: any; min_text?: any;
};

type SortKey = "date" | "minutes" | "stat" | "result";
type SortDir = "asc" | "desc";

interface GameLogTableProps {
  stats: GameLogStat[];
  lineValue: number;
  activeStatLabel: string;
  activeScopeLabel?: string;
  activeStat?: string;
  /** Format line value for display (handles integer stats) */
  formatLine?: (v: number) => string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getMinutesValue(raw: GameLogStat): number | null {
  const value =
    raw?.period_minutes ?? raw?.min_text ?? raw?.min ?? raw?.minutes ??
    raw?.mins ?? raw?.minutos ?? raw?.minutes_played ?? raw?.mp ?? null;
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    if (value.includes(":")) {
      const m = Number(value.split(":")[0]);
      return Number.isNaN(m) ? null : m;
    }
    const p = Number(value.replace("m", ""));
    return Number.isNaN(p) ? null : p;
  }
  const p = Number(value);
  return Number.isNaN(p) ? null : p;
}

function getMinutesLabel(raw: GameLogStat): string {
  const m = getMinutesValue(raw);
  return m === null ? "S/D" : `${Math.round(m)}m`;
}

function getOpponent(item: GameLogStat): string {
  const parts = item?.matchup ? String(item.matchup).trim().split(" ") : [];
  return parts.length > 0 ? parts[parts.length - 1] : "---";
}

function getLocation(item: GameLogStat): string {
  return item?.matchup?.includes("@") ? "@" : "vs";
}

function formatDate(value: string): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatStat(value: number, isPerc?: boolean): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return isPerc ? `${s}%` : s;
}

// ─── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ col, active, dir }: { col: SortKey; active: SortKey; dir: SortDir }) {
  if (col !== active) return <ChevronsUpDown size={11} className="opacity-30" />;
  return dir === "asc"
    ? <ChevronUp   size={11} className="text-[#10b981]" />
    : <ChevronDown size={11} className="text-[#10b981]" />;
}

// ─── Column header button ──────────────────────────────────────────────────────

function SortableHead({
  col, active, dir, onSort, children, align = "left",
}: {
  col: SortKey; active: SortKey; dir: SortDir;
  onSort: (c: SortKey) => void;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-5 py-3 ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest transition-colors ${
          active === col ? "text-[#10b981]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
        }`}
      >
        {align === "right" && <SortIcon col={col} active={active} dir={dir} />}
        {children}
        {align === "left" && <SortIcon col={col} active={active} dir={dir} />}
      </button>
    </th>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function GameLogTable({
  stats,
  lineValue,
  activeStatLabel,
  activeScopeLabel = "Partido",
  activeStat = "",
  formatLine,
}: GameLogTableProps) {
  const [open,    setOpen]    = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const hasWL = stats.some((s) => s.game_result);

  // ── Sort handler ───────────────────────────────────────────────────────────
  const handleSort = (col: SortKey) => {
    if (col === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("desc");
    }
  };

  // ── Sorted rows ────────────────────────────────────────────────────────────
  const sortedStats = useMemo(() => {
    const arr = [...stats];
    arr.sort((a, b) => {
      let va: number, vb: number;
      switch (sortKey) {
        case "date":
          va = new Date(a.game_date).getTime();
          vb = new Date(b.game_date).getTime();
          break;
        case "minutes":
          va = getMinutesValue(a) ?? -1;
          vb = getMinutesValue(b) ?? -1;
          break;
        case "stat":
          va = Number(a.value) || 0;
          vb = Number(b.value) || 0;
          break;
        case "result":
          va = Number(a.value) >= lineValue ? 1 : 0;
          vb = Number(b.value) >= lineValue ? 1 : 0;
          break;
        default:
          return 0;
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return arr;
  }, [stats, sortKey, sortDir, lineValue]);

  // ── Summary bar ────────────────────────────────────────────────────────────
  const totalGames = stats.length;
  const overCount  = stats.filter((s) => Number(s.value) >= lineValue).length;
  const hitPct     = totalGames > 0 ? Math.round((overCount / totalGames) * 100) : 0;
  const lineLabel  = formatLine ? formatLine(lineValue) : lineValue.toFixed(1);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-2xl">

      {/* ── Toggle button ──────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3 text-left">
          <div className="w-9 h-9 rounded-full border border-[#10b981]/25 bg-[#10b981]/10 flex items-center justify-center shrink-0">
            <Table2 size={16} className="text-[#10b981]" />
          </div>
          <div>
            <p className="text-[9px] text-[#10b981] font-black uppercase tracking-[0.25em]">Game Log</p>
            <h3 className="text-[var(--text)] font-black uppercase tracking-tight">
              {open
                ? "Ocultar detalle"
                : `Ver detalle de últimos ${totalGames} · ${activeScopeLabel}`}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Hit rate summary */}
          <div className="hidden md:flex items-center gap-2 text-right">
            <span className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">
              {overCount}/{totalGames} over
            </span>
            <span className={`text-sm font-black tabular-nums ${hitPct >= 50 ? "text-[#10b981]" : "text-red-400"}`}>
              {hitPct}%
            </span>
          </div>
          <div className="hidden md:block h-4 w-px bg-[var(--border)]" />
          <span className="hidden md:block text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">
            Línea {lineLabel} {activeStatLabel} · {activeScopeLabel}
          </span>
          {open
            ? <ChevronUp  size={18} className="text-[#10b981]" />
            : <ChevronDown size={18} className="text-[#10b981]" />}
        </div>
      </button>

      {/* ── Table ──────────────────────────────────────────────────────────────── */}
      {open && (
        <div className="overflow-x-auto border-t border-[var(--border)]">
          <table className="w-full text-left">

            {/* Header */}
            <thead className="bg-[var(--bg)]/60 sticky top-0 z-10">
              <tr>
                <SortableHead col="date"    active={sortKey} dir={sortDir} onSort={handleSort}>
                  Fecha
                </SortableHead>

                <th className="px-5 py-3 text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">
                  Rival
                </th>

                {hasWL && (
                  <SortableHead col="result" active={sortKey} dir={sortDir} onSort={handleSort} align="right">
                    W/L
                  </SortableHead>
                )}

                <SortableHead col="minutes" active={sortKey} dir={sortDir} onSort={handleSort} align="right">
                  MIN
                </SortableHead>

                <SortableHead col="stat"   active={sortKey} dir={sortDir} onSort={handleSort} align="right">
                  {activeStatLabel}
                </SortableHead>

                <th className="px-5 py-3 text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest text-right">
                  Línea
                </th>

                <SortableHead col="result" active={sortKey} dir={sortDir} onSort={handleSort} align="right">
                  Prop
                </SortableHead>
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {sortedStats.map((s, idx) => {
                const statVal      = Number(s.value) || 0;
                const isOver       = statVal >= lineValue;
                const minutes      = getMinutesValue(s);
                const isLowMin     = minutes !== null && minutes < 20;
                const wl           = s.game_result;
                const score        = s.game_score;

                return (
                  <tr
                    key={`${s.game_id ?? s.game_date}-${idx}`}
                    className={`border-t border-[var(--border)] transition-colors ${
                      isOver
                        ? "bg-[#10b981]/[0.04] hover:bg-[#10b981]/[0.08]"
                        : "bg-red-500/[0.03] hover:bg-red-500/[0.06]"
                    }`}
                  >
                    {/* Date */}
                    <td className="px-5 py-3 text-xs text-[#aaa] font-bold whitespace-nowrap">
                      {formatDate(s.game_date)}
                    </td>

                    {/* Rival */}
                    <td className="px-5 py-3 text-xs font-black uppercase whitespace-nowrap">
                      <span className="text-[var(--text-muted)] mr-1">{getLocation(s)}</span>
                      <span className="text-[var(--text)]">{getOpponent(s)}</span>
                    </td>

                    {/* W/L + score (only if data has it) */}
                    {hasWL && (
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {wl ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                              wl === "W"
                                ? "text-[#10b981] border-[#10b981]/30 bg-[#10b981]/10"
                                : "text-red-400 border-red-500/30 bg-red-500/10"
                            }`}>
                              {wl}
                            </span>
                            {score && (
                              <span className="text-[9px] text-[var(--text-muted)] font-bold tabular-nums">
                                {score}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)] text-xs">—</span>
                        )}
                      </td>
                    )}

                    {/* Minutes */}
                    <td className={`px-5 py-3 text-xs text-right font-black tabular-nums whitespace-nowrap ${
                      isLowMin ? "text-orange-400" : "text-[#10b981]"
                    }`}>
                      {getMinutesLabel(s)}
                      {isLowMin && <span className="ml-1">⚠</span>}
                    </td>

                    {/* Stat value */}
                    <td className={`px-5 py-3 text-sm text-right font-black tabular-nums whitespace-nowrap ${
                      isOver ? "text-[#10b981]" : "text-red-400"
                    }`}>
                      {formatStat(statVal, s.is_percentage)}
                    </td>

                    {/* Line */}
                    <td className="px-5 py-3 text-xs text-right text-[#666] font-black tabular-nums whitespace-nowrap">
                      {lineLabel}
                    </td>

                    {/* Over/Under badge */}
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md border ${
                        isOver
                          ? "text-[#10b981] border-[#10b981]/30 bg-[#10b981]/10"
                          : "text-red-400 border-red-500/30 bg-red-500/10"
                      }`}>
                        {isOver ? "Over" : "Under"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>

          </table>

          {/* Summary footer */}
          <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg)]/40 flex items-center justify-between">
            <p className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">
              {totalGames} partido{totalGames !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded bg-[#10b981]/30" />
                <span className="text-[8px] text-[#10b981] font-black uppercase">{overCount} over</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded bg-red-500/30" />
                <span className="text-[8px] text-red-400 font-black uppercase">{totalGames - overCount} under</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
