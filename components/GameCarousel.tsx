// components/GameCarousel.tsx — VERSIÓN FINAL (sin logos ni imágenes)
"use client";
import { useRef } from "react";
import { ChevronLeft, ChevronRight, Radio } from "lucide-react";
import { getTeamColor } from "@/lib/teamColors";

function formatArgTime(dateStr: string): string {
  return new Date(dateStr)
    .toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })
    .replace(/[\u00A0\u202F]/g, " ");
}

function TeamBlock({ abbr, score, isLive }: { abbr: string; score?: string; isLive: boolean }) {
  const color = getTeamColor(abbr);
  return (
    <div className="flex items-center justify-between gap-3 w-full">
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Avatar con color del equipo en lugar de logo */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border font-black text-xs tracking-tighter"
          style={{ background: `${color}18`, borderColor: `${color}35`, color }}
        >
          {abbr.slice(0, 3)}
        </div>
        <span className="text-sm font-black uppercase tracking-tight text-[var(--text)] truncate">
          {abbr}
        </span>
      </div>
      {score !== undefined && (
        <span className={`text-xl font-black tabular-nums shrink-0 ${isLive ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
          {score || "-"}
        </span>
      )}
    </div>
  );
}

function GameCard({ game }: { game: any }) {
  const comp  = game.competitions?.[0];
  const home  = comp?.competitors?.find((c: any) => c.homeAway === "home");
  const away  = comp?.competitors?.find((c: any) => c.homeAway === "away");
  const state = game.status?.type?.state;
  const isLive = state === "in";
  const isFinal = state === "post";

  if (!home || !away) return null;

  const homeAbbr = home.team?.abbreviation ?? "HOME";
  const awayAbbr = away.team?.abbreviation ?? "AWAY";
  const homeColor = getTeamColor(homeAbbr);
  const awayColor = getTeamColor(awayAbbr);

  // Odds from nested structure if ESPN provides it
  const odds   = comp?.odds?.[0];
  const spread = odds?.spread != null ? (Number(odds.spread) > 0 ? `+${odds.spread}` : `${odds.spread}`) : null;
  const total  = odds?.overUnder != null ? `O/U ${odds.overUnder}` : null;

  // Quarter/period detail
  const detail = game.status?.type?.shortDetail ?? "";

  return (
    <div className="min-w-[260px] sm:min-w-[290px] snap-center bg-[var(--surface)] border border-[var(--border)] rounded-3xl overflow-hidden shadow-xl flex flex-col hover:border-[var(--border-strong)] transition-colors group relative">

      {/* Fondo decorativo: nombre del partido como watermark */}
      <span
        className="absolute right-2 bottom-6 font-black italic text-[56px] leading-none select-none pointer-events-none uppercase tracking-tighter opacity-[0.035] text-[var(--text)]"
        aria-hidden="true"
      >
        {awayAbbr}
      </span>

      {/* Status bar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]"
        style={{
          background: isLive
            ? "rgba(239,68,68,0.08)"
            : isFinal
            ? "rgba(107,114,128,0.08)"
            : `${homeColor}08`,
        }}
      >
        <span className="text-[8px] font-black uppercase tracking-[0.25em] text-[var(--text-muted)]">
          {game.status?.type?.description ?? "NBA"}
        </span>
        <div className="flex items-center gap-1.5">
          {isLive && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          )}
          <span
            suppressHydrationWarning
            className={`text-[9px] font-black px-2 py-0.5 rounded-md ${
              isLive
                ? "bg-red-500/15 text-red-400"
                : isFinal
                ? "bg-[var(--surface-soft)] text-[var(--text-muted)]"
                : "bg-[var(--surface-soft)] text-[var(--text-muted)]"
            }`}
          >
            {isLive ? detail : isFinal ? "Final" : formatArgTime(game.date)}
          </span>
        </div>
      </div>

      {/* Teams + scores */}
      <div className="px-4 py-4 flex flex-col gap-3 flex-1 relative z-10">
        <TeamBlock abbr={awayAbbr} score={away.score} isLive={isLive || isFinal} />
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${awayColor}40, ${homeColor}40)` }} />
          <span className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest shrink-0">vs</span>
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${homeColor}40, transparent)` }} />
        </div>
        <TeamBlock abbr={homeAbbr} score={home.score} isLive={isLive || isFinal} />
      </div>

      {/* Odds footer */}
      {(spread || total) && (
        <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--border)] bg-[var(--bg)]">
          {spread && (
            <span className="text-[8px] font-black text-[var(--text-muted)] tabular-nums">
              <span className="text-[var(--text-soft)]">Spread</span> {spread}
            </span>
          )}
          {spread && total && <span className="text-[var(--border)] text-xs">·</span>}
          {total && (
            <span className="text-[8px] font-black text-[var(--text-muted)] tabular-nums">
              {total}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function GameCarousel({ games }: { games: any[] }) {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (!ref.current) return;
    const w = ref.current.clientWidth;
    ref.current.scrollTo({ left: ref.current.scrollLeft + (dir === "left" ? -w : w), behavior: "smooth" });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] flex items-center gap-2">
          <Radio size={13} className="text-red-400" />
          Cartelera del día · Hora ARG
        </h3>
        {games.length > 1 && (
          <div className="flex gap-1.5">
            {(["left","right"] as const).map(d => (
              <button
                key={d}
                type="button"
                onClick={() => scroll(d)}
                className="p-1.5 bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-soft)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] transition-all"
              >
                {d === "left" ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        ref={ref}
        className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] snap-x snap-mandatory"
      >
        {games.length > 0 ? (
          games.map((g: any) => <GameCard key={g.id} game={g} />)
        ) : (
          <div className="w-full bg-[var(--surface)] border border-dashed border-[var(--border)] p-10 rounded-3xl text-center">
            <p className="text-[var(--text-muted)] text-[10px] font-black uppercase tracking-widest">
              Sin partidos en el radar
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
