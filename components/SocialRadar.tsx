// ─────────────────────────────────────────────────────────────────────────────
// components/SocialRadar.tsx
//
// Radar de sentimiento social basado en la tabla reddit_trends.
// Muestra: menciones, sentimiento OVER/UNDER, hype score, trend ↑↓.
// Se integra en el header del jugador o cerca del PickInsightPanel.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Flame, MessageCircle } from "lucide-react";

type RedditTrend = {
  player_name: string;
  team_abbr?:  string | null;
  mentions:    number;
  sentiment?:  string | null;   // "OVER" | "UNDER"
  hype_score:  number;
  trend?:      string | null;   // "up" | "down"
  updated_at:  string;
};

export default function SocialRadar({ playerName }: { playerName: string }) {
  const [data,    setData]    = useState<RedditTrend | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerName) return;
    fetch(`/api/trends?player=${encodeURIComponent(playerName)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d?.trend ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [playerName]);

  if (loading) return null;
  if (!data || data.mentions === 0) return null;

  const isOver  = data.sentiment?.toUpperCase() === "OVER";
  const isUnder = data.sentiment?.toUpperCase() === "UNDER";
  const trendUp = data.trend === "up";
  const trendDn = data.trend === "down";

  const sentimentColor = isOver
    ? "text-[#10b981] border-[#10b981]/40 bg-[#10b981]/10"
    : isUnder
    ? "text-red-400 border-red-400/40 bg-red-400/10"
    : "text-[var(--text-muted)] border-[var(--border)] bg-[var(--bg)]";

  const hypeLevel =
    data.hype_score >= 80 ? "VIRAL"
  : data.hype_score >= 50 ? "CALIENTE"
  : data.hype_score >= 25 ? "ACTIVO"
                           : "TRANQUILO";

  const hypeColor =
    data.hype_score >= 80 ? "text-orange-400"
  : data.hype_score >= 50 ? "text-yellow-400"
  : data.hype_score >= 25 ? "text-[#10b981]"
                           : "text-[var(--text-muted)]";

  return (
    <div className="flex flex-wrap items-center gap-2 px-1">
      {/* Menciones */}
      <div className="flex items-center gap-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-full px-2.5 py-1">
        <MessageCircle size={10} className="text-[var(--text-muted)]" />
        <span className="text-[9px] font-black tabular-nums text-[var(--text)]">
          {data.mentions.toLocaleString()}
        </span>
        <span className="text-[8px] font-black uppercase text-[var(--text-muted)] tracking-widest">
          menciones
        </span>
      </div>

      {/* Sentimiento */}
      {data.sentiment && (
        <div className={`flex items-center gap-1 border rounded-full px-2.5 py-1 ${sentimentColor}`}>
          {isOver  && <TrendingUp  size={10} />}
          {isUnder && <TrendingDown size={10} />}
          <span className="text-[9px] font-black uppercase tracking-widest">
            {data.sentiment}
          </span>
        </div>
      )}

      {/* Hype */}
      {data.hype_score > 0 && (
        <div className="flex items-center gap-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-full px-2.5 py-1">
          <Flame size={10} className={hypeColor} />
          <span className={`text-[9px] font-black uppercase tracking-widest ${hypeColor}`}>
            {hypeLevel}
          </span>
          <span className="text-[8px] text-[var(--text-muted)] font-bold tabular-nums">
            {data.hype_score}
          </span>
        </div>
      )}

      {/* Trend */}
      {data.trend && (
        <div className={`flex items-center gap-1 rounded-full px-2 py-1 border ${
          trendUp ? "text-[#10b981] border-[#10b981]/30 bg-[#10b981]/08"
          : trendDn ? "text-red-400 border-red-400/30 bg-red-400/08"
          : "text-[var(--text-muted)] border-[var(--border)]"
        }`}>
          {trendUp ? <TrendingUp size={10} />
          : trendDn ? <TrendingDown size={10} />
          : <Minus size={10} />}
          <span className="text-[8px] font-black uppercase tracking-widest">
            Reddit
          </span>
        </div>
      )}
    </div>
  );
}
