"use client";

import { SlidersHorizontal, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FilterType = "context" | "threshold" | "wo";

export type ActiveFilter = {
  id: string;       // unique key, e.g. "home", "min:36", "wo:A. Mitchell"
  label: string;    // display text, e.g. "Local", "MIN ≥ 36", "W/O A. Mitchell"
  type: FilterType;
  value?: number;   // for threshold filters
};

interface StatFiltersProps {
  filters: ActiveFilter[];
  totalGames: number;
  filteredGames: number;
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

// ─── Color map by filter type ─────────────────────────────────────────────────

const TYPE_STYLES: Record<FilterType, { chip: string; dot: string }> = {
  context: {
    chip: "bg-blue-500/10 border-blue-500/30 text-blue-400",
    dot:  "bg-blue-400",
  },
  threshold: {
    chip: "bg-orange-500/10 border-orange-500/30 text-orange-400",
    dot:  "bg-orange-400",
  },
  wo: {
    chip: "bg-purple-500/10 border-purple-500/30 text-purple-400",
    dot:  "bg-purple-400",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function StatFilters({
  filters,
  totalGames,
  filteredGames,
  onRemove,
  onClearAll,
}: StatFiltersProps) {
  if (filters.length === 0) return null;

  const sampleReduced = filteredGames < totalGames;
  const isSmallSample = filteredGames <= 5;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-4 py-3 flex flex-wrap items-center gap-2 shadow-xl">

      {/* Icono */}
      <div className="flex items-center gap-2 shrink-0 mr-1">
        <SlidersHorizontal size={13} className="text-[var(--text-muted)]" />
        <span className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest hidden sm:inline">
          Filtros activos
        </span>
      </div>

      {/* Chips */}
      {filters.map((f) => {
        const styles = TYPE_STYLES[f.type];
        return (
          <div
            key={f.id}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${styles.chip}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styles.dot}`} />
            <span>{f.label}</span>
            <button
              type="button"
              onClick={() => onRemove(f.id)}
              className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
              aria-label={`Quitar filtro ${f.label}`}
            >
              <X size={10} />
            </button>
          </div>
        );
      })}

      {/* Separador */}
      <div className="h-4 w-px bg-[var(--border)] mx-1 hidden sm:block" />

      {/* Contador de muestra */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={`text-[10px] font-black tabular-nums ${
            isSmallSample
              ? "text-orange-400"
              : sampleReduced
              ? "text-[var(--text-muted)]"
              : "text-[#10b981]"
          }`}
        >
          {filteredGames} partido{filteredGames !== 1 ? "s" : ""}
        </span>
        {isSmallSample && (
          <span className="text-[9px] text-orange-400 font-black uppercase tracking-widest">
            ⚠ muestra chica
          </span>
        )}
      </div>

      {/* Limpiar todos (solo si hay más de uno) */}
      {filters.length > 1 && (
        <>
          <div className="h-4 w-px bg-[var(--border)] mx-1 hidden sm:block" />
          <button
            type="button"
            onClick={onClearAll}
            className="text-[9px] text-[var(--text-muted)] hover:text-red-400 font-black uppercase tracking-widest transition-colors shrink-0"
          >
            Limpiar todos
          </button>
        </>
      )}
    </div>
  );
}
