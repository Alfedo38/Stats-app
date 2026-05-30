// components/TopPerformersGrid.tsx
// Grid de top performers por categoría — solo CSS, sin imágenes
import Link from "next/link";
import { getTeamColor } from "@/lib/teamColors";
import { TrendingUp, Activity, GitMerge, Zap } from "lucide-react";

type Player = { id: number; full_name: string; team_abbr: string; pts_avg: number; reb_avg: number; ast_avg: number; };

const CATEGORIES = [
  { key: "pts", label: "Puntos",      icon: Zap,        color: "#10b981", stat: (p: Player) => p.pts_avg },
  { key: "reb", label: "Rebotes",     icon: Activity,   color: "#3b82f6", stat: (p: Player) => p.reb_avg },
  { key: "ast", label: "Asistencias", icon: GitMerge,   color: "#f59e0b", stat: (p: Player) => p.ast_avg },
  { key: "pra", label: "PRA",         icon: TrendingUp, color: "#8b5cf6", stat: (p: Player) => p.pts_avg + p.reb_avg + p.ast_avg },
];

function PlayerRow({ player, statValue, rank, accentColor }: { player: Player; statValue: number; rank: number; accentColor: string }) {
  const teamColor = getTeamColor(player.team_abbr);
  const initials  = player.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Link
      href={`/players/${player.id}`}
      className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-[var(--surface-soft)] transition-colors group"
    >
      {/* Rank */}
      <span className="text-[10px] font-black tabular-nums text-[var(--text-muted)] w-4 text-center shrink-0">
        {rank}
      </span>

      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border text-xs font-black"
        style={{ background: `${teamColor}18`, borderColor: `${teamColor}30`, color: teamColor }}
      >
        {initials}
      </div>

      {/* Name + team */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black uppercase tracking-tight text-[var(--text)] truncate group-hover:text-[#10b981] transition-colors">
          {player.full_name}
        </p>
        <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
          {player.team_abbr}
        </p>
      </div>

      {/* Stat value */}
      <span
        className="text-sm font-black tabular-nums shrink-0"
        style={{ color: rank === 1 ? accentColor : "var(--text)" }}
      >
        {statValue.toFixed(1)}
      </span>
    </Link>
  );
}

function CategoryCard({ cat, players }: { cat: typeof CATEGORIES[0]; players: Player[] }) {
  const Icon = cat.icon;
  const sorted = [...players].sort((a, b) => cat.stat(b) - cat.stat(a)).slice(0, 3);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl overflow-hidden shadow-xl">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border)]"
        style={{ background: `${cat.color}08` }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${cat.color}18`, border: `1px solid ${cat.color}30` }}>
          <Icon size={15} style={{ color: cat.color }} />
        </div>
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.25em] text-[var(--text-muted)]">Top 3 L5</p>
          <p className="text-sm font-black uppercase tracking-tight" style={{ color: cat.color }}>{cat.label}</p>
        </div>
      </div>

      {/* Players */}
      <div className="p-2 space-y-0.5">
        {sorted.length === 0 ? (
          <p className="text-center py-4 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Sin datos</p>
        ) : (
          sorted.map((p, i) => (
            <PlayerRow key={p.id} player={p} statValue={cat.stat(p)} rank={i + 1} accentColor={cat.color} />
          ))
        )}
      </div>
    </div>
  );
}

export default function TopPerformersGrid({ performers }: {
  performers: { puntos: Player[]; rebotes: Player[]; asistencias: Player[]; pra: Player[] }
}) {
  const catPlayers = [
    { ...CATEGORIES[0], players: performers.puntos       },
    { ...CATEGORIES[1], players: performers.rebotes      },
    { ...CATEGORIES[2], players: performers.asistencias  },
    { ...CATEGORIES[3], players: performers.pra          },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">
          Jugadores en Racha — Últimos 5 partidos
        </h3>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {catPlayers.map(c => <CategoryCard key={c.key} cat={c} players={c.players} />)}
      </div>
    </section>
  );
}
