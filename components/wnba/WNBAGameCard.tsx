import Link from "next/link";
import { Activity, Clock, Flame, TrendingUp } from "lucide-react";
import type { WNBADailyGame } from "./types";
import { pctAlready, score, statusLabel, timeAR } from "./utils";

function TeamMark({ abbr, name, logo, align = "left" }: { abbr: string; name: string; logo?: string | null; align?: "left" | "right" }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)]">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={abbr} className="h-9 w-9 object-contain" />
        ) : (
          <span className="text-sm font-black text-[#10b981]">{abbr}</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xl font-black uppercase tracking-tighter text-[var(--text)]">{abbr}</p>
        <p className="truncate text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">{name}</p>
      </div>
    </div>
  );
}

export default function WNBAGameCard({ game }: { game: WNBADailyGame }) {
  const label = statusLabel(game);
  const isFinal = label === "FINAL";
  const isLive = label === "EN VIVO";
  const homePct = game.home_win_pct ?? (game.home_win_prob != null ? game.home_win_prob * 100 : null);
  const awayPct = game.away_win_pct ?? (game.away_win_prob != null ? game.away_win_prob * 100 : null);

  const statusClass = isLive
    ? "border-red-400/40 bg-red-500/10 text-red-300"
    : isFinal
      ? "border-[#10b981]/35 bg-[#10b981]/10 text-[#10b981]"
      : "border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-muted)]";

  return (
    <article className="group relative overflow-hidden rounded-[1.7rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl transition-all hover:-translate-y-1 hover:border-[#10b981]/45">
      <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-[#10b981]/10 blur-3xl opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="relative z-10 mb-5 flex items-center justify-between gap-3">
        <div className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${statusClass}`}>
          {label}
        </div>
        <div className="text-right">
          <p className="text-sm font-black tabular-nums text-[var(--text)]">{timeAR(game.scheduled_at)}</p>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
            {game.status_detail ?? game.game_date}
          </p>
        </div>
      </div>

      <div className="relative z-10 space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-black/10 p-3">
          <TeamMark abbr={game.away_team_abbr} name={game.away_team_name} logo={game.away_team_logo} />
          <p className="text-4xl font-black tracking-tighter tabular-nums">{score(game.away_score)}</p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-black/10 p-3">
          <TeamMark abbr={game.home_team_abbr} name={game.home_team_name} logo={game.home_team_logo} />
          <p className="text-4xl font-black tracking-tighter tabular-nums">{score(game.home_score)}</p>
        </div>
      </div>

      <div className="relative z-10 mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {isLive ? <Flame size={14} className="text-red-300" /> : <TrendingUp size={14} className="text-[#10b981]" />}
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              {isLive ? "Game live" : "Chances estimadas"}
            </p>
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            H2H {game.h2h_away_wins ?? 0}-{game.h2h_home_wins ?? 0}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-[var(--border)] bg-black/10 p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">{game.away_team_abbr}</p>
            <p className="text-2xl font-black tabular-nums">{pctAlready(awayPct)}</p>
          </div>
          <div className="rounded-xl border border-[#10b981]/20 bg-[#10b981]/10 p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-[#10b981]">{game.home_team_abbr}</p>
            <p className="text-2xl font-black tabular-nums text-[#10b981]">{pctAlready(homePct)}</p>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-4 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-2"><Clock size={13} /> {game.game_date}</span>
        <Link href="/wnba/players" className="inline-flex items-center gap-1 text-[#10b981] transition hover:opacity-80">
          Ver jugadoras <Activity size={13} />
        </Link>
      </div>
    </article>
  );
}
