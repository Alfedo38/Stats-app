// components/HypeCarousel.tsx
// Carrusel horizontal de Reddit Hype — sin imágenes, CSS puro
"use client";
import { useRef } from "react";
import Link from "next/link";
import { Flame, TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight } from "lucide-react";
import { getTeamColor } from "@/lib/teamColors";

type Trend = {
  id: number; player_name: string; team_abbr?: string | null;
  mentions: number; sentiment?: string | null;
  hype_score: number; trend?: string | null;
};

function HypeBar({ score }: { score: number }) {
  const pct   = Math.min(score, 100);
  const color = score >= 80 ? "#f97316" : score >= 50 ? "#eab308" : score >= 25 ? "#10b981" : "#6b7280";
  return (
    <div className="h-1.5 bg-[var(--bg)] rounded-full overflow-hidden border border-[var(--border)]/50">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function TrendBadge({ trend }: { trend?: string | null }) {
  if (trend === "up")   return <TrendingUp  size={10} className="text-[#10b981]" />;
  if (trend === "down") return <TrendingDown size={10} className="text-red-400"   />;
  return                       <Minus        size={10} className="text-[var(--text-muted)]" />;
}

function HypeCard({ trend }: { trend: Trend }) {
  const teamColor = getTeamColor(trend.team_abbr);
  const initials  = trend.player_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const isOver    = trend.sentiment?.toUpperCase() === "OVER";
  const isUnder   = trend.sentiment?.toUpperCase() === "UNDER";

  const hypeLabel = trend.hype_score >= 80 ? "VIRAL"    :
                    trend.hype_score >= 50 ? "CALIENTE" :
                    trend.hype_score >= 25 ? "ACTIVO"   : "BAJO";

  const hypeColor = trend.hype_score >= 80 ? "#f97316" :
                    trend.hype_score >= 50 ? "#eab308" :
                    trend.hype_score >= 25 ? "#10b981" : "#6b7280";

  return (
    <Link
      href={`/players?search=${encodeURIComponent(trend.player_name)}`}
      className="min-w-[200px] snap-center bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-4 flex flex-col gap-3 hover:border-[var(--border-strong)] transition-colors group relative overflow-hidden"
    >
      {/* Watermark */}
      <span className="absolute -right-2 -bottom-2 text-[52px] font-black italic uppercase tracking-tighter text-[var(--text)] opacity-[0.03] select-none pointer-events-none" aria-hidden>
        {initials}
      </span>

      {/* Avatar + nombre */}
      <div className="flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center border font-black text-xs shrink-0"
          style={{ background: `${teamColor}18`, borderColor: `${teamColor}35`, color: teamColor }}>
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-tight text-[var(--text)] truncate group-hover:text-[#10b981] transition-colors">
            {trend.player_name}
          </p>
          <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
            {trend.team_abbr ?? "NBA"}
          </p>
        </div>
      </div>

      {/* Hype bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: hypeColor }}>{hypeLabel}</span>
          <div className="flex items-center gap-1.5 text-[8px] font-black text-[var(--text-muted)] tabular-nums">
            <TrendBadge trend={trend.trend} />
            {trend.hype_score}
          </div>
        </div>
        <HypeBar score={trend.hype_score} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-[8px] text-[var(--text-muted)] font-black">
          <Flame size={9} style={{ color: hypeColor }} />
          {trend.mentions.toLocaleString()} menciones
        </div>
        {trend.sentiment && (
          <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border ${
            isOver  ? "text-[#10b981] border-[#10b981]/30 bg-[#10b981]/08" :
            isUnder ? "text-red-400 border-red-400/30 bg-red-400/08" :
                      "text-[var(--text-muted)] border-[var(--border)]"
          }`}>
            {trend.sentiment}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function HypeCarousel({ trends }: { trends: Trend[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (d: "left"|"right") => {
    if (!ref.current) return;
    ref.current.scrollTo({ left: ref.current.scrollLeft + (d === "left" ? -280 : 280), behavior: "smooth" });
  };

  if (!trends.length) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] flex items-center gap-2">
          <Flame size={13} className="text-orange-500" />
          Radar Social — Reddit Hype Index
        </h3>
        <div className="flex gap-1.5">
          {(["left","right"] as const).map(d => (
            <button key={d} type="button" onClick={() => scroll(d)}
              className="p-1.5 bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-soft)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] transition-all">
              {d === "left" ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
            </button>
          ))}
        </div>
      </div>
      <div ref={ref} className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] snap-x snap-mandatory [-webkit-overflow-scrolling:touch]">
        {trends.map(t => <HypeCard key={t.id} trend={t} />)}
      </div>
    </section>
  );
}
