import type { CSSProperties, ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus, Ruler, Weight, CalendarDays, Globe2, GraduationCap } from "lucide-react";
import { getTeamColor } from "@/lib/teamColors";

export type PlayerKPI = {
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
};

export type NextGame = {
  opponent: string;
  isHome: boolean;
  date: string;
  time?: string;
};

export type PlayerBioSummary = {
  jerseyNumber?: string | number | null;
  position?: string | null;
  height?: string | null;
  weight?: string | null;
  age?: number | null;
  country?: string | null;
  school?: string | null;
};

interface PlayerHeaderProps {
  playerName: string;
  teamAbbr?: string;
  position?: string;
  kpis?: PlayerKPI[];
  nextGame?: NextGame;
  initials?: string;
  bio?: PlayerBioSummary | null;
}

function TrendIndicator({ value }: { value: number }) {
  if (value > 0)
    return (
      <span className="flex items-center gap-0.5 text-[#10b981]">
        <TrendingUp size={9} />
        <span>+{value.toFixed(1)}</span>
      </span>
    );
  if (value < 0)
    return (
      <span className="flex items-center gap-0.5 text-red-400">
        <TrendingDown size={9} />
        <span>{value.toFixed(1)}</span>
      </span>
    );
  return (
    <span className="flex items-center gap-0.5 text-[var(--text-muted)]">
      <Minus size={9} />
      <span>0.0</span>
    </span>
  );
}

function BioPill({ icon, label, value, accent }: { icon: ReactNode; label: string; value?: any; accent: string }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)]/65 px-2.5 py-2">
      <div className="shrink-0" style={{ color: accent }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[7px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
          {label}
        </div>
        <div className="truncate text-xs font-black uppercase tracking-tight text-[var(--text)]">{value}</div>
      </div>
    </div>
  );
}

export default function PlayerHeader({
  playerName,
  teamAbbr,
  position,
  kpis = [],
  nextGame,
  initials,
  bio,
}: PlayerHeaderProps) {
  const nameParts = playerName.trim().split(" ");
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ");
  const teamColor = getTeamColor(teamAbbr);
  const avatarInitials = initials ?? `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  const finalPosition = position || bio?.position || "POS";

  return (
    <div
      className="relative overflow-hidden rounded-[1.6rem] border border-[#10b981]/20 bg-[var(--surface)] shadow-2xl"
      style={{ "--team-color": teamColor } as CSSProperties}
    >
      <div className="absolute inset-0 opacity-90" style={{ background: `radial-gradient(circle at 82% 26%, ${teamColor}22, transparent 36%), linear-gradient(135deg, ${teamColor}10, transparent 42%)` }} />
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[1.6rem]" style={{ background: `linear-gradient(${teamColor}, #10b981)` }} />

      {teamAbbr && (
        <span
          className="absolute right-4 top-1/2 -translate-y-1/2 font-black italic uppercase leading-none select-none pointer-events-none"
          style={{ fontSize: "clamp(68px, 10vw, 118px)", color: teamColor, opacity: 0.055, letterSpacing: "-0.06em" }}
          aria-hidden="true"
        >
          {teamAbbr}
        </span>
      )}

      <div className="relative z-10 p-4 md:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
          <div className="min-w-0 flex items-start gap-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[1.25rem] border border-[#10b981]/25 bg-black/30 shadow-2xl md:h-20 md:w-20">
              <div className="absolute inset-0 opacity-70" style={{ background: `radial-gradient(circle at 50% 20%, ${teamColor}33, transparent 42%), linear-gradient(135deg, ${teamColor}12, transparent 55%)` }} />
              <div className="relative flex h-full w-full items-center justify-center text-2xl font-black italic tracking-tighter" style={{ color: teamColor }}>
                {avatarInitials}
              </div>
              <div className="absolute bottom-1 right-1 rounded-lg bg-black/80 px-2 py-1 text-[10px] font-black" style={{ color: teamColor }}>
                {finalPosition}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <p className="mb-1.5 flex items-center gap-2 text-[7px] font-black uppercase tracking-[0.3em]" style={{ color: teamColor }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: teamColor }} />
                MoskProps Player Analytics
              </p>

              <h1 className="font-black italic uppercase leading-none tracking-tighter">
                <span className="text-3xl text-[var(--text)] md:text-5xl">{firstName}</span>
                {lastName && <span className="ml-2 text-3xl md:text-5xl" style={{ color: teamColor }}>{lastName}</span>}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {teamAbbr && (
                  <span className="rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest" style={{ color: teamColor, borderColor: `${teamColor}55`, background: `${teamColor}14` }}>
                    {teamAbbr}
                  </span>
                )}
                {finalPosition && (
                  <span className="rounded-full border border-[#10b981]/30 bg-[#10b981]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-[#10b981]">
                    Posición {finalPosition}
                  </span>
                )}
                {bio?.jerseyNumber && (
                  <span className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    #{bio.jerseyNumber}
                  </span>
                )}
              </div>
            </div>
          </div>

          {nextGame && (
            <div className="rounded-2xl border border-[#10b981]/20 bg-black/25 p-3 backdrop-blur-sm">
              <span className="block text-[8px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Próximo partido</span>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div>
                  <span className="block text-xl font-black uppercase tracking-tighter text-[var(--text)]">
                    {nextGame.isHome ? "VS" : "@"} {nextGame.opponent}
                  </span>
                  {nextGame.time && (
                    <span suppressHydrationWarning className="mt-1 block text-[10px] font-black uppercase tracking-widest text-[#10b981]">
                      {nextGame.time} ARG
                    </span>
                  )}
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border text-xs font-black" style={{ background: `${teamColor}15`, borderColor: `${teamColor}40`, color: teamColor }}>
                  {nextGame.opponent.slice(0, 3)}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          <BioPill icon={<Ruler size={12} />} label="Altura" value={bio?.height} accent="#22d3ee" />
          <BioPill icon={<Weight size={12} />} label="Peso" value={bio?.weight} accent="#fb923c" />
          <BioPill icon={<CalendarDays size={12} />} label="Edad" value={bio?.age ? `${bio.age} años` : null} accent="#facc15" />
          <BioPill icon={<Globe2 size={12} />} label="País" value={bio?.country} accent="#a78bfa" />
          <BioPill icon={<GraduationCap size={12} />} label="Origen" value={bio?.school} accent="#10b981" />
        </div>

        {kpis.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--border)]/40 pt-3 sm:grid-cols-4">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/65 px-3 py-2.5">
                <p className="flex items-center gap-1 text-[8px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">
                  {kpi.trend !== undefined && <TrendIndicator value={kpi.trend} />}
                  {kpi.trendLabel ?? kpi.label}
                </p>
                <p className="mt-1 text-xl font-black leading-none tabular-nums text-[var(--text)]">{kpi.value}</p>
                <p className="mt-1 text-[8px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{kpi.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
