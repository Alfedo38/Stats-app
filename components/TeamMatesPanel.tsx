// ─────────────────────────────────────────────────────────────────────────────
// components/TeamMatesPanel.tsx — VERSIÓN FINAL
//
// Panel izquierdo de la player page.
// Novedades vs versión anterior:
//   - Selector de partido del día (dropdown top)
//   - Cuando hay partido seleccionado → filtra jugadores a los 2 equipos
//   - Toggle Lista / Por equipo (cuando hay múltiples teams)
//   - Badge de lesión en el avatar
//   - Hit rate badge
//   - Búsqueda con botón limpiar
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Search, Users, ArrowUpRight,
  LayoutList, Layers, ChevronDown,
  Calendar, X,
} from "lucide-react";
import type { GameSlot } from "@/lib/api";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type InjuryStatus = "OUT" | "DOUBTFUL" | "QUESTIONABLE" | "PROBABLE";

export type TeamMate = {
  id:                 number | string;
  full_name?:         string | null;
  player_name?:       string | null;
  team?:              string | null;
  team_abbreviation?: string | null;
  injury_status?:     InjuryStatus | null;
  hit_rate?:          number | null;
  current_line?:      number | null;
  current_prop?:      string | null;
};

export type StakeOdd = {
  player_name?: string | null;
  prop_type?: string | null;
  line: number | null;
  matchup?: string | null;
  over_price?: number | null;
  under_price?: number | null;
  updated_at?: string | null;
  book?: string | null;
  source?: string | null;
};

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<InjuryStatus, { dot: string; label: string }> = {
  OUT:          { dot: "bg-red-500",    label: "OUT"          },
  DOUBTFUL:     { dot: "bg-red-400",    label: "Doubtful"     },
  QUESTIONABLE: { dot: "bg-orange-400", label: "Questionable" },
  PROBABLE:     { dot: "bg-yellow-400", label: "Probable"     },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getStakePropType(activeStat: string) {
  const map: Record<string, string> = {
    pts: "PTS", ast: "AST", reb: "REB",
    fgm: "FGM", fga: "FGA", fg3m: "3PT", fg3a: "3PTA",
    blk: "BLK", stl: "STL", "stl+blk": "STL+BLK", tov: "TO", to: "TO", pf: "PF",
    "pts+ast": "PA", "pts+reb": "PR", "reb+ast": "RA", "pts+reb+ast": "PRA",
  };
  return map[String(activeStat || "pts").toLowerCase()] || "PTS";
}

function formatOddsValue(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "—";

  // Stake llega normalmente como cuota decimal: 1.36, 2.56, etc.
  // Si alguna fuente trae americana (+120 / -115), la mostramos en formato americano.
  if (n > 1 && n < 20) return n.toFixed(2).replace(/\.00$/, "");
  return n > 0 ? `+${Math.round(n)}` : String(Math.round(n));
}

function oddsToDecimal(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  if (n > 1 && n < 20) return n;
  if (n > 0) return 1 + n / 100;
  return 1 + 100 / Math.abs(n);
}

function pickBetterPrice(a: any, b: any) {
  const ad = oddsToDecimal(a);
  const bd = oddsToDecimal(b);
  if (ad == null) return b ?? null;
  if (bd == null) return a ?? null;
  return bd > ad ? b : a;
}

function formatLine(line: any) {
  const n = Number(line);
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

type StakeLineOption = {
  line: number;
  over_price: number | null;
  under_price: number | null;
  rows: number;
};

function groupStakeLines(odds: StakeOdd[]): StakeLineOption[] {
  const map = new Map<string, StakeLineOption>();

  for (const odd of odds || []) {
    const line = Number(odd.line);
    if (!Number.isFinite(line)) continue;
    const key = String(line);

    const current = map.get(key) || {
      line,
      over_price: null,
      under_price: null,
      rows: 0,
    };

    current.over_price = pickBetterPrice(current.over_price, odd.over_price) as number | null;
    current.under_price = pickBetterPrice(current.under_price, odd.under_price) as number | null;
    current.rows += 1;
    map.set(key, current);
  }

  return [...map.values()].sort((a, b) => a.line - b.line);
}

function pickBalancedLine(odds: StakeLineOption[]) {
  if (!odds.length) return null;
  return [...odds].sort((a, b) => {
    const aO = oddsToDecimal(a.over_price), aU = oddsToDecimal(a.under_price);
    const bO = oddsToDecimal(b.over_price), bU = oddsToDecimal(b.under_price);
    const aB = aO != null && aU != null ? Math.abs(aO - aU) : 9999;
    const bB = bO != null && bU != null ? Math.abs(bO - bU) : 9999;
    if (aB !== bB) return aB - bB;
    return Number(a.line) - Number(b.line);
  })[0];
}

function getNearbyOdds(odds: StakeLineOption[], activeLine: number | null, count = 5) {
  const clean = odds.filter((o) => Number.isFinite(o.line)).sort((a, b) => a.line - b.line);
  if (clean.length <= count) return clean;
  const target = Number(activeLine);
  const index = Number.isFinite(target)
    ? Math.max(0, clean.findIndex((o) => Number(o.line) >= target))
    : Math.floor(clean.length / 2);
  const half = Math.floor(count / 2);
  const start = Math.max(0, Math.min(clean.length - count, index - half));
  return clean.slice(start, start + count);
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function HitRateBadge({ rate }: { rate: number }) {
  const cls =
    rate >= 65 ? "text-[#10b981] bg-[#10b981]/10 border-[#10b981]/25"
  : rate >= 50 ? "text-yellow-400 bg-yellow-500/10 border-yellow-400/25"
               : "text-red-400 bg-red-500/10 border-red-400/25";
  return (
    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border tabular-nums shrink-0 ${cls}`}>
      {rate}%
    </span>
  );
}

function CurrentPlayerOddsCard({
  player,
  stakeOdds,
}: {
  player: (TeamMate & { displayName: string }) | null;
  stakeOdds: StakeOdd[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeStat = searchParams.get("stat") || "pts";
  const propType = getStakePropType(activeStat);
  const activeLineParam = searchParams.get("line");
  const activeLine = activeLineParam != null ? Number(activeLineParam) : null;

  const rawOddsForStat = useMemo(() => {
    return (stakeOdds || [])
      .filter((o) => String(o.prop_type || "").toUpperCase() === propType)
      .filter((o) => o.line !== null && o.line !== undefined);
  }, [stakeOdds, propType]);

  const groupedLines = useMemo(() => groupStakeLines(rawOddsForStat), [rawOddsForStat]);
  const primaryOdd = pickBalancedLine(groupedLines);
  const displayLine = Number.isFinite(Number(activeLine)) ? Number(activeLine) : Number(primaryOdd?.line);
  const visibleOdds = getNearbyOdds(groupedLines, Number.isFinite(displayLine) ? displayLine : null, 5);

  if (!player) return null;

  const setLine = (line: number | null) => {
    if (line == null || !Number.isFinite(Number(line))) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("stat", activeStat);
    params.set("line", String(line));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const hitRate = player.hit_rate ?? null;

  return (
    <div className="rounded-2xl border border-[#10b981]/30 bg-[#10b981]/[0.06] p-3 shadow-[0_0_22px_rgba(16,185,129,0.08)]">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#10b981] text-xs font-black text-black shadow-[0_0_18px_rgba(16,185,129,0.28)]">
          {getInitials(player.displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#10b981]">Jugador actual</p>
          <h3 className="truncate text-sm font-black uppercase leading-tight text-[var(--text)]">{player.displayName}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-cyan-300">{propType}</span>
            {Number.isFinite(displayLine) && (
              <span className="rounded-lg border border-[#10b981]/25 bg-[#10b981]/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-[#10b981]">Línea {formatLine(displayLine)}</span>
            )}
            {hitRate != null && <HitRateBadge rate={hitRate} />}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)]/55 p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Stake</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#10b981]">
              {groupedLines.length} líneas únicas
              {rawOddsForStat.length !== groupedLines.length ? ` · ${rawOddsForStat.length} precios` : ""}
            </p>
          </div>
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[8px] font-black text-[var(--text-muted)]">
            Decimal
          </span>
        </div>

        {visibleOdds.length > 0 ? (
          <div className="space-y-1.5">
            <div className="grid grid-cols-[52px_1fr_1fr] gap-2 px-2 text-[7px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
              <span>Línea</span>
              <span>Over</span>
              <span>Under</span>
            </div>

            {visibleOdds.map((odd) => {
              const active = Number(odd.line) === Number(displayLine);
              return (
                <button
                  key={`${propType}-${odd.line}`}
                  type="button"
                  onClick={() => setLine(Number(odd.line))}
                  title={`Usar línea ${formatLine(odd.line)} ${propType}`}
                  className={`grid w-full grid-cols-[52px_1fr_1fr] items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all ${active ? "border-[#10b981] bg-[#10b981] text-black shadow-[0_0_14px_rgba(16,185,129,0.25)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#10b981]/45"}`}
                >
                  <span className="text-[11px] font-black tabular-nums">{formatLine(odd.line)}</span>
                  <span className="text-[10px] font-black tabular-nums">
                    {formatOddsValue(odd.over_price)}
                  </span>
                  <span className="text-[10px] font-black tabular-nums">
                    {formatOddsValue(odd.under_price)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-4 text-center text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            Sin líneas para {propType}
          </div>
        )}

        {rawOddsForStat.length > groupedLines.length && (
          <p className="mt-2 text-[8px] font-bold leading-relaxed text-[var(--text-muted)]">
            Agrupé líneas repetidas y dejé la mejor cuota disponible para cada lado.
          </p>
        )}
      </div>
    </div>
  );
}

function PlayerRow({
  player,
  isCurrent,
  dimmed,
}: {
  player: TeamMate & { displayName: string };
  isCurrent: boolean;
  dimmed: boolean;
}) {
  const injStatus = player.injury_status;
  const statusCfg = injStatus ? STATUS_DOT[injStatus] : null;
  const isOut     = injStatus === "OUT";

  return (
    <Link
      href={`/players/${player.id}`}
      className={`group flex items-center gap-3 rounded-2xl p-3 transition-all border ${
        isCurrent
          ? "bg-[#10b981]/10 border-[#10b981]/40"
          : isOut
          ? "border-transparent opacity-50 hover:opacity-75 hover:bg-[var(--surface-soft)]"
          : dimmed
          ? "border-transparent opacity-30 hover:opacity-60 hover:bg-[var(--surface-soft)]"
          : "border-transparent hover:bg-[var(--surface-soft)] hover:border-[var(--border)]"
      }`}
    >
      {/* Avatar */}
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border font-black text-xs relative ${
          isCurrent
            ? "bg-[#10b981] text-black border-[#10b981]"
            : "bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] group-hover:text-[var(--text)]"
        }`}
      >
        {getInitials(player.displayName)}
        {statusCfg && !isCurrent && (
          <span
            title={statusCfg.label}
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--surface)] ${statusCfg.dot}`}
          />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-black uppercase truncate leading-tight ${
          isCurrent   ? "text-[#10b981]"
        : isOut       ? "text-[var(--text-muted)] line-through"
                      : "text-[var(--text)]"
        }`}>
          {player.displayName}
        </p>
        <p className="text-[9px] font-black uppercase tracking-widest mt-0.5 truncate">
          {isCurrent ? (
            <span className="text-[#10b981]">Jugador actual</span>
          ) : injStatus ? (
            <span className={injStatus === "OUT" ? "text-red-400" : "text-orange-400"}>
              {STATUS_DOT[injStatus].label}
            </span>
          ) : player.current_line != null && player.current_prop ? (
            <span className="text-[var(--text-muted)]">
              {player.current_line} {player.current_prop}
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">Ver análisis</span>
          )}
        </p>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2 shrink-0">
        {player.hit_rate != null && !isCurrent && !isOut && (
          <HitRateBadge rate={player.hit_rate} />
        )}
        <ArrowUpRight
          size={15}
          className={`transition-colors ${
            isCurrent ? "text-[#10b981]" : "text-[var(--text-soft)] group-hover:text-[#10b981]"
          }`}
        />
      </div>
    </Link>
  );
}

function TeamGroupHeader({ abbr, count, outCount }: {
  abbr: string; count: number; outCount: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 mt-2 mb-1 first:mt-0">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-[0.22em] text-[#10b981]">{abbr}</span>
        <span className="text-[8px] text-[var(--text-muted)] font-black tabular-nums">{count}</span>
      </div>
      {outCount > 0 && (
        <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
          {outCount} OUT
        </span>
      )}
    </div>
  );
}

// ─── Game Selector ─────────────────────────────────────────────────────────────

function GameSelector({
  games,
  selected,
  onSelect,
}: {
  games:    GameSlot[];
  selected: GameSlot | null;
  onSelect: (g: GameSlot | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const label = selected
    ? `${selected.away_team} @ ${selected.home_team}`
    : "Todos los partidos";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${
          selected
            ? "border-[#10b981]/50 bg-[#10b981]/10 text-[#10b981]"
            : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Calendar size={12} className="shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onSelect(null); }}
              onKeyDown={(e) => e.key === "Enter" && onSelect(null)}
              className="text-[#10b981]/70 hover:text-[#10b981] transition-colors p-0.5"
            >
              <X size={11} />
            </span>
          )}
          <ChevronDown
            size={13}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden">
          {/* Opción: todos */}
          <button
            type="button"
            onClick={() => { onSelect(null); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest transition-colors text-left ${
              !selected
                ? "bg-[#10b981]/10 text-[#10b981]"
                : "text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
            }`}
          >
            <Users size={12} />
            Todos los partidos
          </button>

          <div className="border-t border-[var(--border)]" />

          {/* Lista de partidos */}
          {games.length === 0 ? (
            <p className="px-4 py-3 text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">
              Sin partidos disponibles
            </p>
          ) : (
            games.map((g) => {
              const isActive =
                selected?.matchup === g.matchup;
              return (
                <button
                  key={g.matchup}
                  type="button"
                  onClick={() => { onSelect(g); setOpen(false); }}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                    isActive
                      ? "bg-[#10b981]/10 text-[#10b981]"
                      : "text-[var(--text)] hover:bg-[var(--surface-soft)]"
                  }`}
                >
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest">
                      {g.away_team} <span className="text-[var(--text-muted)]">@</span> {g.home_team}
                    </p>
                    {(g.spread != null || g.total != null) && (
                      <p className="text-[8px] text-[var(--text-muted)] font-black mt-0.5 tabular-nums">
                        {g.spread != null && `Spread ${g.spread > 0 ? "+" : ""}${g.spread}`}
                        {g.spread != null && g.total != null && " · "}
                        {g.total != null && `O/U ${g.total}`}
                      </p>
                    )}
                  </div>
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Overlay para cerrar */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function TeamMatesPanel({
  teamAbbr,
  players,
  currentPlayerId,
  games = [],
  selectedGame,
  onSelectGame,
  filterTeams,
  stakeOdds = [],
  className = "",
}: {
  teamAbbr?:       string | null;
  players:         TeamMate[];
  currentPlayerId?: number | string | null;
  games?:          GameSlot[];
  selectedGame?:   GameSlot | null;
  onSelectGame?:   (g: GameSlot | null) => void;
  filterTeams?:    string[];
  stakeOdds?:      StakeOdd[];
  className?:      string;
}) {
  const [query,     setQuery]     = useState("");
  const [groupView, setGroupView] = useState(false);

  const normalizedCurrentId = currentPlayerId ? String(currentPlayerId) : "";

  const enriched = useMemo(
    () => (players || []).map((p) => ({
      ...p,
      displayName: p.full_name || p.player_name || `Jugador ${p.id}`,
    })),
    [players]
  );

  const distinctTeams = useMemo(() => {
    const set = new Set(
      enriched
        .map((p) => (p.team_abbreviation || p.team || "").toUpperCase())
        .filter(Boolean)
    );
    return [...set];
  }, [enriched]);

  const hasMultipleTeams = distinctTeams.length > 1;

  // Aplicar filtro de partido seleccionado
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const teams = (filterTeams || []).map((t) => t.toUpperCase());
    return enriched
      .filter((p) => {
        const abbr = (p.team_abbreviation || p.team || "").toUpperCase();
        const matchesGame = teams.length === 0 || teams.includes(abbr);
        const matchesSearch = !q || p.displayName.toLowerCase().includes(q);
        return matchesGame && matchesSearch;
      })
      .sort((a, b) => {
        const aCurr = String(a.id) === normalizedCurrentId;
        const bCurr = String(b.id) === normalizedCurrentId;
        if (aCurr && !bCurr) return -1;
        if (!aCurr && bCurr) return  1;
        const aOut = a.injury_status === "OUT" ? 0 : 1;
        const bOut = b.injury_status === "OUT" ? 0 : 1;
        if (aOut !== bOut) return aOut - bOut;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [enriched, query, normalizedCurrentId, filterTeams]);

  const currentPlayer = useMemo(() => {
    return enriched.find((p) => String(p.id) === normalizedCurrentId) || null;
  }, [enriched, normalizedCurrentId]);

  const rosterFiltered = useMemo(() => {
    return filtered.filter((p) => String(p.id) !== normalizedCurrentId);
  }, [filtered, normalizedCurrentId]);

  // Grouped view
  const grouped = useMemo(() => {
    if (!groupView || !hasMultipleTeams) return null;
    const map: Record<string, typeof rosterFiltered> = {};
    for (const p of rosterFiltered) {
      const key = (p.team_abbreviation || p.team || "OTROS").toUpperCase();
      if (!map[key]) map[key] = [];
      map[key].push(p);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [rosterFiltered, groupView, hasMultipleTeams]);

  const outCount = enriched.filter((p) => p.injury_status === "OUT").length;
  const gtdCount = enriched.filter(
    (p) => p.injury_status === "DOUBTFUL" || p.injury_status === "QUESTIONABLE"
  ).length;

  // Jugador no está en el partido seleccionado → dimmed pero visible
  const isPlayerInGame = (p: TeamMate) => {
    if (!filterTeams?.length) return true;
    const abbr = (p.team_abbreviation || p.team || "").toUpperCase();
    return filterTeams.includes(abbr);
  };

  return (
    <aside className={`bg-[var(--surface)] border border-[var(--border)] rounded-[1.5rem] overflow-hidden shadow-2xl flex flex-col min-h-0 ${className}`}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="p-4 border-b border-[var(--border)] space-y-3">

        {/* Título + contadores */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] text-[#10b981] font-black uppercase tracking-[0.25em]">Equipo</p>
            <h2 className="text-[var(--text)] text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <Users size={17} className="text-[#10b981]" />
              {teamAbbr ?? "Roster"}
            </h2>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] text-[10px] font-black rounded-full px-2.5 py-0.5 tabular-nums">
                {enriched.length}
              </span>
              {outCount > 0 && (
                <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                  {outCount} OUT
                </span>
              )}
              {gtdCount > 0 && (
                <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400">
                  {gtdCount} GTD
                </span>
              )}
            </div>

            {hasMultipleTeams && (
              <button
                type="button"
                onClick={() => setGroupView((v) => !v)}
                className={`flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border transition-all ${
                  groupView
                    ? "border-[#10b981]/40 bg-[#10b981]/10 text-[#10b981]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                }`}
              >
                {groupView ? <><LayoutList size={10} /> Lista</> : <><Layers size={10} /> Por equipo</>}
              </button>
            )}
          </div>
        </div>

        {/* Selector de partido — solo si hay games */}
        {games.length > 0 && onSelectGame && (
          <GameSelector
            games={games}
            selected={selectedGame ?? null}
            onSelect={onSelectGame}
          />
        )}

        {/* Búsqueda */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar compañero..."
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl pl-9 pr-8 py-3 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] font-bold outline-none focus:border-[#10b981]/70 transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)] text-xs font-black"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <CurrentPlayerOddsCard player={currentPlayer} stakeOdds={stakeOdds} />
      </div>

      {/* ── Lista de jugadores ──────────────────────────────────────────────── */}
      <div className="flex-1 min-h-[180px] overflow-y-auto p-2 [scrollbar-width:thin] [scrollbar-color:#10b981_transparent]">
        {rosterFiltered.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-[var(--text-muted)] text-xs font-black uppercase tracking-widest">
              {query ? "Sin resultados" : "Sin compañeros disponibles"}
            </p>
          </div>
        ) : grouped ? (
          grouped.map(([abbr, teamPlayers]) => (
            <div key={abbr}>
              <TeamGroupHeader
                abbr={abbr}
                count={teamPlayers.length}
                outCount={teamPlayers.filter((p) => p.injury_status === "OUT").length}
              />
              {teamPlayers.map((p) => (
                <PlayerRow
                  key={String(p.id)}
                  player={p}
                  isCurrent={String(p.id) === normalizedCurrentId}
                  dimmed={!isPlayerInGame(p) && String(p.id) !== normalizedCurrentId}
                />
              ))}
            </div>
          ))
        ) : (
          rosterFiltered.map((p) => (
            <PlayerRow
              key={String(p.id)}
              player={p}
              isCurrent={String(p.id) === normalizedCurrentId}
              dimmed={!isPlayerInGame(p) && String(p.id) !== normalizedCurrentId}
            />
          ))
        )}
      </div>
    </aside>
  );
}
