"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Search, ShieldAlert } from "lucide-react";

type InjuryContextRow = {
  game_date?: string | Date | null;
  matchup?: string | null;
  player_id?: number | string | null;
  target_player?: string | null;
  team_abbreviation?: string | null;
  team_name?: string | null;
  absent_teammate?: string | null;
  absent_status?: string | null;
  absent_importance?: string | null;
  absent_importance_score?: number | string | null;
  sample_confidence?: string | null;
  games?: number | string | null;
  avg_min?: number | string | null;
  avg_pts?: number | string | null;
  avg_reb?: number | string | null;
  avg_ast?: number | string | null;
  avg_pra?: number | string | null;
  avg_pr?: number | string | null;
  avg_pa?: number | string | null;
  avg_ra?: number | string | null;
  avg_3pm?: number | string | null;
  avg_usage_pct?: number | string | null;
  avg_touches?: number | string | null;
  avg_potential_ast?: number | string | null;
  avg_rebound_chances?: number | string | null;
  absent_avg_min?: number | string | null;
  absent_avg_pra?: number | string | null;
  absent_avg_usage_pct?: number | string | null;
  first_game?: string | Date | null;
  last_game?: string | Date | null;
};

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(value: unknown, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits).replace(/\.0$/, "");
}

function norm(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function normalizeSearch(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function rowKey(row: InjuryContextRow) {
  return String(row.absent_teammate || "").trim();
}

function makeJsonSafe(value: any): any {
  if (typeof value === "bigint") return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(makeJsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, makeJsonSafe(v)]));
  }
  return value;
}

function confidenceStyle(row: InjuryContextRow) {
  const confidence = norm(row.sample_confidence);
  const importance = norm(row.absent_importance);

  if (confidence === "HIGH" || importance === "STAR") {
    return {
      row: "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-200 hover:border-emerald-300/60",
      badge: "bg-emerald-400 text-black",
      detail: "border-emerald-400/25 bg-emerald-400/[0.07]",
    };
  }

  if (confidence === "MEDIUM" || importance === "STARTER") {
    return {
      row: "border-cyan-400/25 bg-cyan-400/[0.07] text-cyan-200 hover:border-cyan-300/50",
      badge: "border border-cyan-400/30 bg-cyan-400/15 text-cyan-200",
      detail: "border-cyan-400/20 bg-cyan-400/[0.055]",
    };
  }

  return {
    row: "border-slate-600/40 bg-slate-500/[0.04] text-slate-300 hover:border-slate-400/40",
    badge: "border border-slate-600/40 bg-slate-500/15 text-slate-300",
    detail: "border-slate-600/30 bg-slate-500/[0.035]",
  };
}

function compareRows(a: InjuryContextRow, b: InjuryContextRow) {
  const minDiff = num(b.avg_min, -1) - num(a.avg_min, -1);
  if (minDiff !== 0) return minDiff;

  const scoreDiff = num(b.absent_importance_score) - num(a.absent_importance_score);
  if (scoreDiff !== 0) return scoreDiff;

  const gamesDiff = num(b.games) - num(a.games);
  if (gamesDiff !== 0) return gamesDiff;

  return String(a.absent_teammate || "").localeCompare(String(b.absent_teammate || ""));
}

export default function ActiveInjuryContextCard({
  rows,
  playerId,
  gameDate,
  activeWoTeammate,
  onApplyWo,
  onClearWo,
}: {
  rows?: InjuryContextRow[];
  playerId?: string | number | null;
  gameDate?: string | null;
  activeWoTeammate?: string | null;
  onApplyWo?: (row: InjuryContextRow) => void;
  onClearWo?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [teammateQuery, setTeammateQuery] = useState("");
  const [teammateOptions, setTeammateOptions] = useState<InjuryContextRow[]>([]);
  const [teammateLoading, setTeammateLoading] = useState(false);

  const activeRows = useMemo(() => {
    return [...(rows || [])]
      .filter((row) => row?.absent_teammate)
      .sort((a, b) => {
        const scoreDiff = num(b.absent_importance_score) - num(a.absent_importance_score);
        if (scoreDiff !== 0) return scoreDiff;
        const confidenceRank = (r: InjuryContextRow) => (norm(r.sample_confidence) === "HIGH" ? 2 : norm(r.sample_confidence) === "MEDIUM" ? 1 : 0);
        const confDiff = confidenceRank(b) - confidenceRank(a);
        if (confDiff !== 0) return confDiff;
        return compareRows(a, b);
      });
  }, [rows]);

  useEffect(() => {
    if (activeWoTeammate) {
      setSelectedName(activeWoTeammate);
      setIsOpen(true);
    }
  }, [activeWoTeammate]);

  useEffect(() => {
    const controller = new AbortController();

    if (!playerId || !isOpen) {
      setTeammateOptions([]);
      setTeammateLoading(false);
      return () => controller.abort();
    }

    const q = teammateQuery.trim();
    setTeammateLoading(true);

    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      params.set("playerId", String(playerId));
      params.set("q", q);
      params.set("limit", "50");

      fetch(`/api/wo-teammates?${params.toString()}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((json) => {
          if (json?.ok && Array.isArray(json.rows)) {
            setTeammateOptions(makeJsonSafe(json.rows).sort(compareRows));
          } else {
            setTeammateOptions([]);
          }
        })
        .catch((err) => {
          if (err?.name !== "AbortError") setTeammateOptions([]);
        })
        .finally(() => setTeammateLoading(false));
    }, q ? 220 : 0);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [playerId, teammateQuery, isOpen]);

  const allRows = useMemo(() => {
    const merged = new Map<string, InjuryContextRow>();

    for (const row of activeRows) {
      const k = normalizeSearch(row.absent_teammate);
      if (k) merged.set(k, row);
    }

    for (const row of teammateOptions) {
      const k = normalizeSearch(row.absent_teammate);
      if (!k) continue;
      const existing = merged.get(k);
      if (!existing || num(row.avg_min) > num(existing.avg_min)) merged.set(k, row);
    }

    return [...merged.values()].sort(compareRows);
  }, [activeRows, teammateOptions]);

  const filteredRows = useMemo(() => {
    const q = normalizeSearch(teammateQuery);
    const base = q ? allRows.filter((row) => normalizeSearch(row.absent_teammate).includes(q)) : allRows;
    return base.slice(0, 18);
  }, [allRows, teammateQuery]);

  const selectedRow = useMemo(() => {
    const key = normalizeSearch(selectedName);
    if (!key) return null;
    return allRows.find((row) => normalizeSearch(row.absent_teammate) === key) || null;
  }, [selectedName, allRows]);

  const activeCount = activeRows.length;
  const totalCount = allRows.length || activeCount;

  if (!activeRows.length && !playerId) return null;

  return (
    <section className="rounded-[1.25rem] border border-red-400/20 bg-red-500/[0.03] p-2.5 min-w-0">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-1 py-1 text-left"
      >
        <span className="flex min-w-0 items-center gap-2 text-[8px] font-black uppercase tracking-[0.22em] text-red-300">
          <ShieldAlert size={12} /> Bajas / W-O
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-red-300/20 bg-red-400/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-red-200">
            {activeCount ? `${activeCount} activas` : `${totalCount || 0} W/O`}
          </span>
          {isOpen ? <ChevronUp size={14} className="text-red-200" /> : <ChevronDown size={14} className="text-red-200" />}
        </span>
      </button>

      {activeWoTeammate && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-purple-400/30 bg-purple-400/10 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[8px] font-black uppercase tracking-widest text-purple-200">Filtro activo</p>
            <p className="truncate text-[11px] font-black uppercase text-white">W/O {activeWoTeammate}</p>
          </div>
          <button type="button" onClick={onClearWo} className="rounded-lg border border-purple-300/25 px-2 py-1 text-[8px] font-black uppercase text-purple-100 hover:bg-purple-300/10">
            Quitar
          </button>
        </div>
      )}

      {!isOpen && activeRows.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {activeRows.slice(0, 3).map((row) => (
            <button
              key={`compact-${rowKey(row)}`}
              type="button"
              onClick={() => {
                setSelectedName(rowKey(row));
                setIsOpen(true);
              }}
              className="max-w-full rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-[var(--text)]"
            >
              <span className="text-white">{row.absent_teammate}</span> <span className="text-red-300">{norm(row.absent_status) || "OUT"}</span>
            </button>
          ))}
        </div>
      )}

      {isOpen && (
        <div className="mt-2 space-y-2.5">
          {activeRows.length > 0 && (
            <div>
              <p className="mb-1.5 text-[8px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Activas hoy</p>
              <div className="space-y-1.5">
                {activeRows.map((row) => {
                  const selected = normalizeSearch(selectedName) === normalizeSearch(row.absent_teammate);
                  const cls = confidenceStyle(row);
                  const confidence = norm(row.sample_confidence) || "S/D";
                  return (
                    <button
                      key={rowKey(row)}
                      type="button"
                      onClick={() => setSelectedName(rowKey(row))}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition ${selected ? "border-[#10b981]/70 bg-[#10b981]/12" : cls.row}`}
                    >
                      <span className="min-w-0 truncate text-[10px] font-black uppercase text-[var(--text)]">
                        {row.absent_teammate} <span className="text-red-400">{norm(row.absent_status) || "OUT"}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[7px] font-black uppercase tracking-widest ${cls.badge}`}>{confidence}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)]/60 p-2.5">
            <p className="mb-2 text-[8px] font-black uppercase tracking-[0.22em] text-cyan-300">Compañeros</p>
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-black/30 px-3 py-2">
              <Search size={12} className="shrink-0 text-[var(--text-muted)]" />
              <input
                value={teammateQuery}
                onChange={(e) => setTeammateQuery(e.target.value)}
                placeholder="Buscar jugador del equipo..."
                className="min-w-0 flex-1 bg-transparent text-[10px] font-black uppercase tracking-widest text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
              />
              {teammateLoading && <Loader2 size={12} className="animate-spin text-cyan-300" />}
            </div>

            <div className="mt-2 max-h-[184px] overflow-auto pr-1 [scrollbar-width:thin] [scrollbar-color:#10b981_transparent]">
              <div className="space-y-1.5">
                {filteredRows.map((row) => {
                  const selected = normalizeSearch(selectedName) === normalizeSearch(row.absent_teammate);
                  const isActive = activeRows.some((r) => normalizeSearch(r.absent_teammate) === normalizeSearch(row.absent_teammate));
                  return (
                    <button
                      key={`mate-${rowKey(row)}`}
                      type="button"
                      onClick={() => setSelectedName(rowKey(row))}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition ${selected ? "border-cyan-300/60 bg-cyan-300/10" : "border-[var(--border)] bg-[var(--surface)] hover:border-cyan-300/40"}`}
                    >
                      <span className="min-w-0 truncate text-[10px] font-black uppercase text-[var(--text)]">{row.absent_teammate}</span>
                      <span className="flex shrink-0 items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                        {isActive && <span className="rounded-full bg-red-400/15 px-1.5 py-0.5 text-red-200">OUT</span>}
                        <span>{fmt(row.avg_min)} min</span>
                      </span>
                    </button>
                  );
                })}
                {!teammateLoading && filteredRows.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-4 text-center text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    Sin muestra W/O
                  </div>
                )}
              </div>
            </div>
          </div>

          {selectedRow && (
            <div className={`rounded-2xl border p-3 ${confidenceStyle(selectedRow).detail}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-black uppercase tracking-tight text-[var(--text)]">
                    W/O {selectedRow.absent_teammate}
                  </p>
                  <p className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    {norm(selectedRow.absent_importance) || "COMPAÑERO"} · {norm(selectedRow.sample_confidence) || "MUESTRA"} · {num(selectedRow.games)} juegos
                  </p>
                </div>
                {activeRows.some((r) => normalizeSearch(r.absent_teammate) === normalizeSearch(selectedRow.absent_teammate)) && (
                  <span className="rounded-full border border-red-300/25 bg-red-400/10 px-2 py-1 text-[7px] font-black uppercase tracking-widest text-red-200">
                    Activa
                  </span>
                )}
              </div>

              <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                <span className="rounded-lg bg-black/30 px-1.5 py-1 text-[9px] font-black text-[var(--text)]">{fmt(selectedRow.avg_pts)} PTS</span>
                <span className="rounded-lg bg-black/30 px-1.5 py-1 text-[9px] font-black text-[var(--text)]">{fmt(selectedRow.avg_reb)} REB</span>
                <span className="rounded-lg bg-black/30 px-1.5 py-1 text-[9px] font-black text-[var(--text)]">{fmt(selectedRow.avg_ast)} AST</span>
                <span className="rounded-lg bg-black/30 px-1.5 py-1 text-[9px] font-black text-[#10b981]">{fmt(selectedRow.avg_pra)} PRA</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (normalizeSearch(activeWoTeammate) === normalizeSearch(selectedRow.absent_teammate)) onClearWo?.();
                  else onApplyWo?.(selectedRow);
                }}
                className={`mt-2 w-full rounded-lg border px-2 py-1.5 text-[8px] font-black uppercase tracking-widest transition ${normalizeSearch(activeWoTeammate) === normalizeSearch(selectedRow.absent_teammate) ? "border-purple-300/40 bg-purple-300 text-black" : "border-[#10b981]/25 bg-[#10b981]/10 text-[#10b981] hover:bg-[#10b981]/15"}`}
              >
                {normalizeSearch(activeWoTeammate) === normalizeSearch(selectedRow.absent_teammate) ? "W/O aplicado" : "Aplicar W/O"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
