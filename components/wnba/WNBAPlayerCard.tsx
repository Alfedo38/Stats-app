import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { WNBAPlayerRow } from "./types";
import { fmt, initials, pct, qs } from "./utils";

export default function WNBAPlayerCard({
  player,
  rank,
  season = "2026",
  seasonType = "Regular Season",
  compact = false,
}: {
  player: WNBAPlayerRow;
  rank?: number;
  season?: string;
  seasonType?: string;
  compact?: boolean;
}) {
  const playerName = player.player_name || "Jugadora WNBA";

  return (
    <Link
      href={`/wnba/players/${player.player_id}${qs({ season, season_type: seasonType })}`}
      className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl transition-all hover:-translate-y-0.5 hover:border-[#10b981]/45 hover:bg-[var(--surface-soft)]"
    >
      <div className="absolute -right-12 -top-12 h-28 w-28 rounded-full bg-[#10b981]/5 blur-2xl opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] text-base font-black text-[var(--text-muted)] transition group-hover:border-[#10b981]/40 group-hover:bg-[#10b981] group-hover:text-black">
          {initials(playerName)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-black uppercase tracking-tight text-[var(--text)] transition group-hover:text-[#10b981]">
                {playerName}
              </h3>
              <p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                {player.team_abbr || "WNBA"} · {player.position || "POS —"}{rank ? ` · Rank #${rank}` : ""}
              </p>
            </div>
            <ArrowUpRight size={16} className="shrink-0 text-[var(--text-muted)] transition group-hover:text-[#10b981]" />
          </div>

          {!compact && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Mini label="PTS" value={fmt(player.pts)} />
              <Mini label="REB" value={fmt(player.reb)} />
              <Mini label="AST" value={fmt(player.ast)} />
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            <span>GP {player.gp ?? "—"}</span>
            <span>MIN {fmt(player.min)}</span>
            <span>TS {pct(player.ts_pct)}</span>
            <span>USG {pct(player.usg_pct)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-black/10 px-3 py-2">
      <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <p className="text-sm font-black tabular-nums text-[var(--text)]">{value}</p>
    </div>
  );
}
