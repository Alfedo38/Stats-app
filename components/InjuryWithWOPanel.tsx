"use client";

import { useState, useEffect, useCallback } from "react";
import { Ambulance, Clock, RefreshCw, UserMinus, UserCheck } from "lucide-react";
import type { ActiveFilter } from "@/components/StatFilters";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type InjuryStatus = "OUT" | "DOUBTFUL" | "QUESTIONABLE" | "PROBABLE";

export type InjuredPlayer = {
  player_id?: number | string;
  player_name: string;
  team_name: string;
  team_abbreviation: string;
  team_logo?: string;
  status: InjuryStatus;
  reason?: string;           // e.g. "Knee - Rest"
  updated_at?: string;       // ISO date string
};

export type InjuryReport = {
  source?: string;           // e.g. "NBAINJURIES"
  total_rows?: number;
  snapshot_at?: string;      // ISO date string
  players: InjuredPlayer[];
};

type WOMode = "wo" | "with" | null;

interface InjuryWithWOPanelProps {
  /** Pass data directly (SSR) OR leave undefined to use internal fetch hook */
  injuryReport?: InjuryReport;
  /** Filter to show only players from specific teams (e.g. the game's two teams) */
  filterTeams?: string[];    // abbreviations, e.g. ["OKC", "SAS"]
  /** Called when the user toggles WITH or W/O on a player */
  onFilterChange?: (filter: ActiveFilter | null, playerId: string) => void;
  className?: string;
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<InjuryStatus, { label: string; headerClass: string; dotClass: string; rowClass: string }> = {
  PROBABLE: {
    label: "Probable",
    headerClass: "text-[#10b981] bg-[#10b981]/10",
    dotClass: "bg-[#10b981]",
    rowClass: "text-[#10b981]",
  },
  QUESTIONABLE: {
    label: "Questionable",
    headerClass: "text-orange-400 bg-orange-500/10",
    dotClass: "bg-orange-400",
    rowClass: "text-orange-400",
  },
  DOUBTFUL: {
    label: "Doubtful",
    headerClass: "text-red-400 bg-red-500/10",
    dotClass: "bg-red-400",
    rowClass: "text-red-400",
  },
  OUT: {
    label: "Out",
    headerClass: "text-red-600 bg-red-500/15",
    dotClass: "bg-red-500",
    rowClass: "text-red-500",
  },
};

const STATUS_ORDER: InjuryStatus[] = ["OUT", "DOUBTFUL", "QUESTIONABLE", "PROBABLE"];

// ─── ⚠️  DB HOOK — Replace this with your real data fetching  ──────────────────
//
//  This hook is the ONLY place you need to change to connect your database.
//  Replace the fetch() call with your API route, Supabase query, Prisma call, etc.
//
//  Expected return shape: InjuryReport
//  Example with Supabase:
//    const { data } = await supabase
//      .from('injuries')
//      .select('player_name, team_name, team_abbreviation, team_logo, status, reason, updated_at')
//      .order('updated_at', { ascending: false })
//    return { players: data, snapshot_at: data[0]?.updated_at }
//
// ──────────────────────────────────────────────────────────────────────────────

function useInjuryReport(enabled: boolean): {
  data: InjuryReport | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [data,    setData]    = useState<InjuryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [tick,    setTick]    = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    // ✏️  REPLACE THIS with your real endpoint or DB query
    // Your API route should return a JSON object matching InjuryReport type:
    // { players: InjuredPlayer[], source?: string, snapshot_at?: string, total_rows?: number }
    fetch("/api/injuries")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: InjuryReport) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [enabled, tick]);

  return { data, loading, error, refetch };
}

// ─── Format helpers ────────────────────────────────────────────────────────────

function formatSnapshotDate(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit",
      month: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires",
    });
  } catch {
    return iso;
  }
}

function getPlayerId(p: InjuredPlayer): string {
  return p.player_id ? String(p.player_id) : `${p.team_abbreviation}:${p.player_name}`;
}

// ─── Single player row with WITH / W/O buttons ────────────────────────────────

function PlayerRow({
  player,
  mode,
  onToggle,
}: {
  player: InjuredPlayer;
  mode: WOMode;
  onToggle: (playerId: string, newMode: WOMode) => void;
}) {
  const cfg = STATUS_CONFIG[player.status];
  const pid = getPlayerId(player);

  const toggle = (clicked: "with" | "wo") => {
    onToggle(pid, mode === clicked ? null : clicked);
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl hover:bg-white/[0.03] transition-colors group">
      {/* Left: dot + name + reason */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} />
        <div className="min-w-0">
          <p className="text-xs text-[var(--text)] font-black uppercase leading-tight truncate">
            {player.player_name}
          </p>
          {player.reason && (
            <p className="text-[9px] text-[var(--text-muted)] font-bold truncate mt-0.5">
              {player.reason}
            </p>
          )}
        </div>
      </div>

      {/* Right: WITH / W/O buttons */}
      <div className="flex gap-1.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => toggle("with")}
          title={`Filtrar partidos CON ${player.player_name}`}
          className={`flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-lg border transition-all ${
            mode === "with"
              ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
              : "border-[var(--border)] text-[var(--text-muted)] hover:border-amber-500/30 hover:text-amber-400"
          }`}
        >
          <UserCheck size={10} />
          WITH
        </button>

        <button
          type="button"
          onClick={() => toggle("wo")}
          title={`Filtrar partidos SIN ${player.player_name}`}
          className={`flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-lg border transition-all ${
            mode === "wo"
              ? "bg-purple-500/15 border-purple-500/40 text-purple-400"
              : "border-[var(--border)] text-[var(--text-muted)] hover:border-purple-500/30 hover:text-purple-400"
          }`}
        >
          <UserMinus size={10} />
          W/O
        </button>
      </div>
    </div>
  );
}

// ─── Status section ────────────────────────────────────────────────────────────

function StatusSection({
  status,
  players,
  playerModes,
  onToggle,
}: {
  status: InjuryStatus;
  players: InjuredPlayer[];
  playerModes: Record<string, WOMode>;
  onToggle: (pid: string, mode: WOMode) => void;
}) {
  if (players.length === 0) return null;
  const cfg = STATUS_CONFIG[status];

  return (
    <div>
      {/* Section header */}
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg mb-1 ${cfg.headerClass}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
        <span className="text-[9px] font-black uppercase tracking-widest">
          {cfg.label} · {players.length}
        </span>
      </div>

      {/* Players */}
      <div className="ml-1">
        {players.map((p) => (
          <PlayerRow
            key={getPlayerId(p)}
            player={p}
            mode={playerModes[getPlayerId(p)] ?? null}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function InjuryWithWOPanel({
  injuryReport: injuryReportProp,
  filterTeams,
  onFilterChange,
  className = "",
}: InjuryWithWOPanelProps) {

  // Use prop data (SSR) or fetch internally (CSR)
  const useFetch = injuryReportProp === undefined;
  const { data: fetchedData, loading, error, refetch } = useInjuryReport(useFetch);

  const report: InjuryReport | null = injuryReportProp ?? fetchedData;

  // Track WITH / W/O state per player
  const [playerModes, setPlayerModes] = useState<Record<string, WOMode>>({});

  const handleToggle = useCallback(
    (pid: string, newMode: WOMode) => {
      setPlayerModes((prev) => ({ ...prev, [pid]: newMode }));

      if (!onFilterChange) return;

      if (newMode === null) {
        onFilterChange(null, pid);
        return;
      }

      // Find player name for label
      const allPlayers = report?.players ?? [];
      const player = allPlayers.find((p) => getPlayerId(p) === pid);
      const name = player?.player_name ?? pid;

      const filter: ActiveFilter = {
        id: `${newMode}:${pid}`,
        label: newMode === "wo" ? `W/O ${name}` : `WITH ${name}`,
        type: "wo",
        value: undefined,
      };

      onFilterChange(filter, pid);
    },
    [onFilterChange, report]
  );

  // Filter players by teams if specified
  const allPlayers = report?.players ?? [];
  const displayPlayers = filterTeams?.length
    ? allPlayers.filter((p) =>
        filterTeams.map((t) => t.toUpperCase()).includes(p.team_abbreviation.toUpperCase())
      )
    : allPlayers;

  // Group by team, then by status
  const teamMap = new Map<string, { abbr: string; name: string; logo?: string; players: InjuredPlayer[] }>();
  for (const p of displayPlayers) {
    const key = p.team_abbreviation.toUpperCase();
    if (!teamMap.has(key)) {
      teamMap.set(key, { abbr: key, name: p.team_name, logo: p.team_logo, players: [] });
    }
    teamMap.get(key)!.players.push(p);
  }
  const teams = Array.from(teamMap.values()).sort((a, b) => a.abbr.localeCompare(b.abbr));

  // Active filters count
  const activeCount = Object.values(playerModes).filter(Boolean).length;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <aside className={`bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-2xl ${className}`}>

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <Ambulance size={16} className="text-red-500" />
            <div>
              <span className="text-[var(--text)] text-sm font-black uppercase italic">
                INJURY{" "}
              </span>
              <span className="text-red-500 text-sm font-black uppercase italic">
                REPORT
              </span>
            </div>

            {/* Active filter badge */}
            {activeCount > 0 && (
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-400">
                {activeCount} filtro{activeCount > 1 ? "s" : ""} activo{activeCount > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Refetch button (only when using internal fetch) */}
          {useFetch && (
            <button
              type="button"
              onClick={refetch}
              disabled={loading}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors disabled:opacity-40"
              aria-label="Actualizar injury report"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          )}
        </div>

        {/* Metadata row */}
        <div className="flex items-center justify-between gap-2">
          {report?.source && (
            <span className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest">
              Fuente: {report.source}
              {report.total_rows !== undefined && ` · Filas: ${report.total_rows}`}
            </span>
          )}
          {report?.snapshot_at && (
            <div className="flex items-center gap-1 text-[var(--text-muted)]">
              <Clock size={10} />
              <span className="text-[8px] font-bold tabular-nums">
                {formatSnapshotDate(report.snapshot_at)}
              </span>
            </div>
          )}
        </div>

        {/* Latest snapshot badge */}
        <div className="mt-2 flex items-center justify-end">
          <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-red-500/30 text-red-400 bg-red-500/10">
            Latest Snapshot
          </span>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────────── */}
      <div className="p-3 max-h-[600px] overflow-y-auto no-scrollbar">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <RefreshCw size={20} className="text-[#10b981] animate-spin" />
            <p className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">
              Cargando...
            </p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <p className="text-[10px] text-red-400 font-black uppercase tracking-widest">
              Error al cargar
            </p>
            <p className="text-[9px] text-[var(--text-muted)] font-bold">{error}</p>
            <button
              type="button"
              onClick={refetch}
              className="mt-2 text-[9px] text-[#10b981] font-black uppercase tracking-widest hover:underline"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && teams.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8">
            <p className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest">
              Sin lesionados reportados
            </p>
          </div>
        )}

        {/* Teams + players */}
        {!loading && !error && teams.map((team, teamIdx) => (
          <div
            key={team.abbr}
            className={`${teamIdx > 0 ? "mt-4 pt-4 border-t border-[var(--border)]" : ""}`}
          >
            {/* Team header */}
            <div className="flex items-center gap-2.5 px-1 mb-2">
              {team.logo ? (
                <img
                  src={team.logo}
                  alt={team.abbr}
                  className="w-6 h-6 object-contain drop-shadow-md"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-[var(--surface-soft)] border border-[var(--border)] flex items-center justify-center">
                  <span className="text-[7px] font-black text-[var(--text-muted)]">{team.abbr.slice(0, 2)}</span>
                </div>
              )}
              <div>
                <p className="text-xs font-black text-[var(--text)] uppercase leading-tight">{team.name}</p>
                <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest">{team.abbr}</p>
              </div>
              <span className="ml-auto text-[8px] text-[var(--text-muted)] font-black tabular-nums">
                {team.players.length} jugador{team.players.length !== 1 ? "es" : ""}
              </span>
            </div>

            {/* Players grouped by status */}
            <div className="space-y-2">
              {STATUS_ORDER.map((status) => {
                const byStatus = team.players.filter((p) => p.status === status);
                return (
                  <StatusSection
                    key={status}
                    status={status}
                    players={byStatus}
                    playerModes={playerModes}
                    onToggle={handleToggle}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Footer: hint ───────────────────────────────────────────────────────── */}
      {teams.length > 0 && (
        <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg)]/30">
          <p className="text-[8px] text-[var(--text-muted)] font-bold leading-relaxed text-center">
            <span className="text-amber-400 font-black">WITH</span> = mostrar partidos jugando junto ·{" "}
            <span className="text-purple-400 font-black">W/O</span> = mostrar partidos sin ese jugador
          </p>
        </div>
      )}
    </aside>
  );
}