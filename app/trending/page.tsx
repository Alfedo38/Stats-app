// app/trending/page.tsx — VERSIÓN FINAL
import Link from "next/link";
import { ArrowLeft, Target, Zap, Trophy, GitMerge, TrendingUp, TrendingDown, Minus, Flame } from "lucide-react";
import { getTopPerformers, getRedditTrends } from "@/lib/api";
import { getTeamColor } from "@/lib/teamColors";

export const dynamic = "force-dynamic";
export const metadata = { title: "On Fire | MoskProps" };

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerStat {
  id: number; full_name: string; team_abbr: string;
  pts_avg: number; reb_avg: number; ast_avg: number;
}

type Trend = {
  id: number; player_name: string; team_abbr?: string | null;
  mentions: number; sentiment?: string | null; hype_score: number; trend?: string | null;
};

// ─── Player card ──────────────────────────────────────────────────────────────

function PlayerCard({ player, rank, statValue, statLabel, accentColor, trend }: {
  player: PlayerStat; rank: number; statValue: number;
  statLabel: string; accentColor: string; trend?: Trend | null;
}) {
  const teamColor = getTeamColor(player.team_abbr);
  const initials  = player.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const trendDir  = trend?.trend ?? null;

  return (
    <Link
      href={`/players/${player.id}`}
      className="group flex items-center gap-4 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-2xl hover:border-[var(--border-strong)] transition-all"
    >
      {/* Rank */}
      <div className="text-2xl font-black tabular-nums text-[var(--border)] group-hover:text-[var(--text-muted)] transition-colors w-7 text-center shrink-0">
        {rank}
      </div>

      {/* Avatar */}
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center border font-black text-sm shrink-0"
        style={{ background: `${teamColor}15`, borderColor: `${teamColor}30`, color: teamColor }}>
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black uppercase tracking-tight text-[var(--text)] truncate group-hover:text-[#10b981] transition-colors">
          {player.full_name}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            {player.team_abbr}
          </span>
          {/* Mini stats */}
          {["PTS","REB","AST"].map((s, i) => {
            const val = [player.pts_avg, player.reb_avg, player.ast_avg][i];
            return (
              <span key={s} className="text-[8px] font-black tabular-nums text-[var(--text-muted)]">
                <span className="text-[var(--text-soft)]">{s}</span> {val.toFixed(1)}
              </span>
            );
          })}
        </div>
      </div>

      {/* Stat value */}
      <div className="text-right shrink-0">
        <p className="text-2xl font-black tabular-nums" style={{ color: rank === 1 ? accentColor : "var(--text)" }}>
          {statValue.toFixed(1)}
        </p>
        <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest">{statLabel} avg</p>
      </div>

      {/* Social trend (if any) */}
      {trend && (
        <div className="flex flex-col items-center gap-1 shrink-0 pl-2 border-l border-[var(--border)]">
          {trendDir === "up"   && <TrendingUp   size={13} className="text-[#10b981]" />}
          {trendDir === "down" && <TrendingDown  size={13} className="text-red-400"   />}
          {!trendDir            && <Minus         size={13} className="text-[var(--text-muted)]" />}
          <span className={`text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${
            trend.sentiment === "OVER"  ? "text-[#10b981] border-[#10b981]/30 bg-[#10b981]/08" :
            trend.sentiment === "UNDER" ? "text-red-400   border-red-400/30   bg-red-400/08"   :
            "text-[var(--text-muted)] border-[var(--border)]"
          }`}>
            {trend.sentiment ?? "—"}
          </span>
          <span className="text-[7px] font-black tabular-nums text-[var(--text-muted)] flex items-center gap-0.5">
            <Flame size={8} className="text-orange-400" />{trend.hype_score}
          </span>
        </div>
      )}
    </Link>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, color, players, statKey, statLabel, trends }: {
  icon: any; title: string; color: string;
  players: PlayerStat[]; statKey: keyof PlayerStat; statLabel: string;
  trends: Trend[];
}) {
  const sorted = [...players].sort((a, b) => Number(b[statKey]) - Number(a[statKey])).slice(0, 5);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center border"
          style={{ background: `${color}18`, borderColor: `${color}30` }}>
          <Icon size={15} style={{ color }} />
        </div>
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.25em] text-[var(--text-muted)]">Top 5 L5 partidos</p>
          <h2 className="text-sm font-black uppercase tracking-tight" style={{ color }}>{title}</h2>
        </div>
      </div>
      <div className="space-y-2">
        {sorted.map((p, i) => {
          const tr = trends.find(t =>
            t.player_name.toLowerCase().includes(p.full_name.split(" ").pop()?.toLowerCase() ?? "")
          );
          return (
            <PlayerCard
              key={p.id}
              player={p}
              rank={i + 1}
              statValue={Number(p[statKey])}
              statLabel={statLabel}
              accentColor={color}
              trend={tr ?? null}
            />
          );
        })}
      </div>
    </section>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function TrendingPage() {
  const [data, trends] = await Promise.all([
    getTopPerformers(),
    getRedditTrends(),
  ]);

  const { puntos, rebotes, asistencias, pra } = data as any;

  const sections = [
    { icon: Zap,       title: "Puntos",      color: "#10b981", players: puntos,      statKey: "pts_avg" as const, statLabel: "PTS" },
    { icon: Target,    title: "Rebotes",     color: "#3b82f6", players: rebotes,     statKey: "reb_avg" as const, statLabel: "REB" },
    { icon: GitMerge,  title: "Asistencias", color: "#f59e0b", players: asistencias, statKey: "ast_avg" as const, statLabel: "AST" },
    { icon: Trophy,    title: "PRA",         color: "#8b5cf6", players: pra,         statKey: "pts_avg" as const, statLabel: "PRA" },
  ];

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] pb-20">
      <nav className="border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <Link href="/" className="text-[var(--text-muted)] hover:text-[#10b981] transition-colors flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
          <ArrowLeft size={14} /> Inicio
        </Link>
      </nav>

      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-10">
        <header>
          <p className="text-[9px] font-black uppercase tracking-[0.35em] text-[#10b981] mb-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse inline-block" />
            Últimos 5 partidos
          </p>
          <h1 className="text-5xl md:text-6xl font-black italic uppercase tracking-tighter leading-none">
            On <span className="text-[#10b981]">Fire</span>
          </h1>
          <p className="text-[var(--text-muted)] text-sm mt-2">
            Rankings actualizados + sentimiento social de Reddit para cada jugador.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {sections.map(s => (
            <Section key={s.title} {...s} trends={trends as Trend[]} />
          ))}
        </div>
      </div>
    </main>
  );
}
