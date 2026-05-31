import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import type { WNBAPlayerRow } from "./types";
import { fmt, initials, qs } from "./utils";

const metrics = [
  { key: "pts", label: "PTS" },
  { key: "reb", label: "REB" },
  { key: "ast", label: "AST" },
] as const;

export default function WNBAPlayerLeaders({
  players,
  season,
  seasonType,
}: {
  players: WNBAPlayerRow[];
  season: string;
  seasonType: string;
}) {
  const leaders = metrics
    .map((metric) => {
      const player = [...players].sort((a, b) => Number(b[metric.key] ?? 0) - Number(a[metric.key] ?? 0))[0];
      return { metric, player };
    })
    .filter((x) => x.player);

  if (!leaders.length) return null;

  return (
    <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {leaders.map(({ metric, player }) => (
        <Link
          key={metric.key}
          href={`/wnba/players/${player.player_id}${qs({ season, season_type: seasonType })}`}
          className="group overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl transition-all hover:-translate-y-0.5 hover:border-[#10b981]/45"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#10b981]/25 bg-[#10b981]/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-[#10b981]">
              <Sparkles size={13} /> Líder {metric.label}
            </div>
            <ArrowUpRight size={16} className="text-[var(--text-muted)] transition group-hover:text-[#10b981]" />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] text-sm font-black text-[var(--text-muted)] transition group-hover:bg-[#10b981] group-hover:text-black">
              {initials(player.player_name)}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-black uppercase tracking-tight text-[var(--text)] group-hover:text-[#10b981]">
                {player.player_name}
              </h3>
              <p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                {player.team_abbr || "WNBA"} · {player.position || "POS —"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black tracking-tighter text-[#10b981] tabular-nums">{fmt(player[metric.key])}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">prom</p>
            </div>
          </div>
        </Link>
      ))}
    </section>
  );
}
