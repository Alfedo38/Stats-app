"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Radio, Clock, Tv } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type GameOption = {
  id: string;
  homeTeam: string;        // abbreviation e.g. "OKC"
  awayTeam: string;        // abbreviation e.g. "SAS"
  homeTeamName?: string;
  awayTeamName?: string;
  homeLogo?: string;
  awayLogo?: string;
  date: string;            // ISO string
  isLive?: boolean;
  liveDetail?: string;     // e.g. "Q3 8:42"
  homeScore?: number;
  awayScore?: number;
};

export type GameSelection = {
  game: GameOption;
  teams: string[];         // [homeAbbr, awayAbbr]
};

interface GameSelectorProps {
  games: GameOption[];
  /** Called when user selects a game — pass [] to reset to all teams */
  onSelect: (selection: GameSelection | null) => void;
  className?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatArgTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires",
    });
  } catch {
    return "--:--";
  }
}

function formatArgDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-AR", {
      day: "numeric",
      month: "short",
      timeZone: "America/Argentina/Buenos_Aires",
    });
  } catch {
    return "";
  }
}

function TeamLogo({ src, abbr, size = 20 }: { src?: string; abbr: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    return (
      <img
        src={src}
        alt={abbr}
        width={size}
        height={size}
        className="object-contain drop-shadow-sm"
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-[var(--surface-soft)] border border-[var(--border)] flex items-center justify-center shrink-0"
    >
      <span style={{ fontSize: size * 0.35 }} className="font-black text-[var(--text-muted)]">
        {abbr.slice(0, 2)}
      </span>
    </div>
  );
}

// ─── Dropdown item ─────────────────────────────────────────────────────────────

function GameItem({
  game,
  selected,
  onSelect,
}: {
  game: GameOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left border ${
        selected
          ? "bg-[#10b981]/10 border-[#10b981]/30"
          : "border-transparent hover:bg-[var(--surface-soft)] hover:border-[var(--border)]"
      }`}
    >
      {/* Live badge or time */}
      <div className="shrink-0 w-14 text-right">
        {game.isLive ? (
          <span className="text-[8px] font-black text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-md uppercase tracking-wider animate-pulse">
            {game.liveDetail ?? "Live"}
          </span>
        ) : (
          <span suppressHydrationWarning className="text-[10px] font-black text-[var(--text-muted)] tabular-nums">
            {formatArgTime(game.date)}
          </span>
        )}
      </div>

      {/* Away team */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <TeamLogo src={game.awayLogo} abbr={game.awayTeam} size={18} />
        <span className={`text-xs font-black uppercase ${selected ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
          {game.awayTeam}
        </span>
        {game.isLive && game.awayScore !== undefined && (
          <span className="text-xs font-black tabular-nums text-[var(--text)]">{game.awayScore}</span>
        )}
      </div>

      {/* VS separator */}
      <span className="text-[9px] text-[var(--text-muted)] font-black shrink-0">@</span>

      {/* Home team */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <TeamLogo src={game.homeLogo} abbr={game.homeTeam} size={18} />
        <span className={`text-xs font-black uppercase ${selected ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
          {game.homeTeam}
        </span>
        {game.isLive && game.homeScore !== undefined && (
          <span className="text-xs font-black tabular-nums text-[var(--text)]">{game.homeScore}</span>
        )}
      </div>

      {/* Check */}
      {selected && (
        <div className="w-4 h-4 rounded-full bg-[#10b981] flex items-center justify-center shrink-0">
          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
            <path d="M1 3L3 5L7 1" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function GameSelector({ games, onSelect, className = "" }: GameSelectorProps) {
  const [open, setOpen]         = useState(false);
  const [selected, setSelected] = useState<GameOption | null>(null);
  const ref                     = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (game: GameOption) => {
    const isSame = selected?.id === game.id;
    const next = isSame ? null : game;
    setSelected(next);
    setOpen(false);
    onSelect(next ? { game: next, teams: [next.homeTeam, next.awayTeam] } : null);
  };

  const liveCount = games.filter((g) => g.isLive).length;

  // ── Trigger button content ─────────────────────────────────────────────────
  const triggerContent = selected ? (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <TeamLogo src={selected.awayLogo} abbr={selected.awayTeam} size={16} />
      <span className="text-xs font-black uppercase text-[#10b981] truncate">
        {selected.awayTeam} @ {selected.homeTeam}
      </span>
      <span suppressHydrationWarning className="text-[9px] text-[var(--text-muted)] font-bold shrink-0">
        {selected.isLive ? (
          <span className="text-red-400 animate-pulse">{selected.liveDetail ?? "Live"}</span>
        ) : (
          formatArgTime(selected.date)
        )}
      </span>
    </div>
  ) : (
    <div className="flex items-center gap-2 flex-1">
      <Tv size={13} className="text-[var(--text-muted)] shrink-0" />
      <span className="text-xs font-black uppercase text-[var(--text-muted)]">
        Todos los juegos
      </span>
      {liveCount > 0 && (
        <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 animate-pulse">
          {liveCount} live
        </span>
      )}
    </div>
  );

  return (
    <div ref={ref} className={`relative ${className}`}>

      {/* ── Trigger ─────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
          selected
            ? "bg-[#10b981]/8 border-[#10b981]/30 hover:border-[#10b981]/50"
            : "bg-[var(--bg)] border-[var(--border)] hover:border-[var(--border-strong)]"
        }`}
      >
        {triggerContent}
        <ChevronDown
          size={14}
          className={`text-[var(--text-muted)] shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* ── Dropdown ────────────────────────────────────────────────────────── */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-50 overflow-hidden">

          {/* Header */}
          <div className="px-3 pt-3 pb-2 border-b border-[var(--border)]">
            <p className="text-[8px] font-black uppercase tracking-[0.25em] text-[var(--text-muted)]">
              Seleccioná un partido
            </p>
            <p className="text-[9px] text-[var(--text-muted)] font-bold mt-0.5">
              Filtra jugadores y lesionados automáticamente
            </p>
          </div>

          {/* "All games" option */}
          <div className="px-2 pt-2">
            <button
              type="button"
              onClick={() => handleSelect(null as any)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all border ${
                !selected
                  ? "bg-[#10b981]/10 border-[#10b981]/30"
                  : "border-transparent hover:bg-[var(--surface-soft)]"
              }`}
            >
              <Tv size={14} className={selected ? "text-[var(--text-muted)]" : "text-[#10b981]"} />
              <span className={`text-xs font-black uppercase ${selected ? "text-[var(--text-muted)]" : "text-[#10b981]"}`}>
                Todos los juegos
              </span>
            </button>
          </div>

          {/* Games list */}
          <div className="px-2 pt-1 pb-2 space-y-0.5 max-h-[280px] overflow-y-auto no-scrollbar">
            {games.length === 0 ? (
              <p className="text-center py-6 text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest">
                Sin partidos hoy
              </p>
            ) : (
              games.map((game) => (
                <GameItem
                  key={game.id}
                  game={game}
                  selected={selected?.id === game.id}
                  onSelect={() => handleSelect(game)}
                />
              ))
            )}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--bg)]/40">
            <div className="flex items-center gap-1.5">
              <Clock size={10} className="text-[var(--text-muted)]" />
              <p className="text-[8px] text-[var(--text-muted)] font-bold">Horario ARG (UTC-3)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CÓMO CONVERTIR tus games de GameCarousel al tipo GameOption:
//
// const gameOptions: GameOption[] = games.map((g) => {
//   const home = g.competitions[0].competitors.find((c) => c.homeAway === "home");
//   const away = g.competitions[0].competitors.find((c) => c.homeAway === "away");
//   return {
//     id: g.id,
//     homeTeam: home.team.abbreviation,
//     awayTeam: away.team.abbreviation,
//     homeTeamName: home.team.displayName,
//     awayTeamName: away.team.displayName,
//     homeLogo: home.team.logo,
//     awayLogo: away.team.logo,
//     date: g.date,
//     isLive: g.status.type.state === "in",
//     liveDetail: g.status.type.shortDetail,
//     homeScore: Number(home.score),
//     awayScore: Number(away.score),
//   };
// });
// ─────────────────────────────────────────────────────────────────────────────
