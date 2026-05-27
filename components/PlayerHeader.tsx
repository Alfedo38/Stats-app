// components/PlayerHeader.tsx
//
// Drop-in header for the player page.
// Shows: player name, team, position, photo background,
// 4 KPIs with trend vs L10, and next game badge.

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type PlayerKPI = {
  label: string;           // e.g. "Usage Rate"
  value: string;           // e.g. "16.6%"
  trend?: number;          // delta vs L10: positive = up, negative = down
  trendLabel?: string;     // e.g. "vs L10"
};

export type NextGame = {
  opponent: string;        // e.g. "OKC"
  opponentLogo?: string;
  isHome: boolean;
  date: string;            // ISO string
  time?: string;           // e.g. "20:30" ARG
};

interface PlayerHeaderProps {
  playerName: string;
  teamAbbr?: string;
  teamName?: string;
  position?: string;
  photoUrl?: string;       // player headshot — used as background
  teamLogoUrl?: string;
  kpis?: PlayerKPI[];
  nextGame?: NextGame;
  initials?: string;       // fallback if no photo
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function TrendIndicator({ value }: { value: number }) {
  if (value > 0) return (
    <span className="flex items-center gap-0.5 text-[#10b981]">
      <TrendingUp size={9} />
      <span>+{value.toFixed(1)}</span>
    </span>
  );
  if (value < 0) return (
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

function TeamLogoFallback({ abbr }: { abbr: string }) {
  return (
    <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
      <span className="text-[9px] font-black text-white/70">{abbr.slice(0, 2)}</span>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function PlayerHeader({
  playerName,
  teamAbbr,
  teamName,
  position,
  photoUrl,
  teamLogoUrl,
  kpis = [],
  nextGame,
  initials,
}: PlayerHeaderProps) {

  // Split name for large display (First / Last)
  const nameParts   = playerName.trim().split(" ");
  const firstName   = nameParts[0] ?? "";
  const restOfName  = nameParts.slice(1).join(" ");

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] shadow-2xl">

      {/* ── Background: player photo or gradient ──────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none select-none">
        {photoUrl ? (
          <>
            <img
              src={photoUrl}
              alt=""
              aria-hidden="true"
              className="absolute bottom-0 right-0 h-full max-w-[45%] object-contain object-bottom opacity-20 mix-blend-luminosity"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
            {/* Gradient overlay left → right */}
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--surface)] via-[var(--surface)]/80 to-transparent" />
          </>
        ) : (
          /* Subtle grid pattern fallback */
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: "linear-gradient(var(--color-border-tertiary) 1px, transparent 1px), linear-gradient(90deg, var(--color-border-tertiary) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
        )}
      </div>

      {/* ── Content ───────────────────────────────────────────────────────────── */}
      <div className="relative z-10 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">

          {/* LEFT: identity */}
          <div className="flex-1 min-w-0">

            {/* Eyebrow: source tag */}
            <p className="text-[8px] text-[#10b981] font-black uppercase tracking-[0.35em] mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] inline-block" />
              MoskProps Player Analytics
            </p>

            {/* Player name — large italic display */}
            <h1 className="font-black italic uppercase leading-none tracking-tighter">
              <span className="text-[var(--text)] text-4xl md:text-5xl block">{firstName}</span>
              {restOfName && (
                <span className="text-[#10b981] text-4xl md:text-5xl block">{restOfName}</span>
              )}
            </h1>

            {/* Team + position */}
            <div className="flex items-center gap-3 mt-3">
              {teamLogoUrl ? (
                <img
                  src={teamLogoUrl}
                  alt={teamAbbr ?? ""}
                  className="w-7 h-7 object-contain opacity-80"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              ) : teamAbbr ? (
                <TeamLogoFallback abbr={teamAbbr} />
              ) : null}

              {teamAbbr && (
                <span className="text-[var(--text-muted)] text-xs font-black uppercase tracking-widest">
                  {teamAbbr}
                  {position && <span className="text-[var(--text-muted)]/50 mx-1">·</span>}
                  {position}
                </span>
              )}
            </div>
          </div>

          {/* RIGHT: initials avatar (when no photo) OR next game badge */}
          <div className="flex flex-col items-end gap-3 shrink-0">

            {/* Avatar initials — only shown when no photo */}
            {!photoUrl && initials && (
              <div className="w-16 h-16 rounded-2xl bg-[var(--surface-soft)] border border-[var(--border)] flex items-center justify-center">
                <span className="text-xl font-black text-[var(--text-muted)] tracking-tight">{initials}</span>
              </div>
            )}

            {/* Next game badge */}
            {nextGame && (
              <div className="flex items-center gap-2 bg-[var(--bg)]/60 border border-[var(--border)] rounded-xl px-3 py-2 backdrop-blur-sm">
                <div className="flex flex-col items-end">
                  <span className="text-[7px] text-[var(--text-muted)] font-black uppercase tracking-widest">
                    Próximo partido
                  </span>
                  <span className="text-xs text-[var(--text)] font-black uppercase mt-0.5">
                    {nextGame.isHome ? "vs" : "@"} {nextGame.opponent}
                  </span>
                  {nextGame.time && (
                    <span suppressHydrationWarning className="text-[8px] text-[var(--text-muted)] font-bold tabular-nums">
                      {nextGame.time} ARG
                    </span>
                  )}
                </div>
                {nextGame.opponentLogo ? (
                  <img
                    src={nextGame.opponentLogo}
                    alt={nextGame.opponent}
                    className="w-8 h-8 object-contain"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                ) : (
                  <TeamLogoFallback abbr={nextGame.opponent} />
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── KPI bar ──────────────────────────────────────────────────────────── */}
        {kpis.length > 0 && (
          <div className="mt-6 pt-5 border-t border-[var(--border)]/50 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="flex flex-col gap-1">
                <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-[0.22em] flex items-center gap-1">
                  {kpi.trend !== undefined && (
                    <TrendIndicator value={kpi.trend} />
                  )}
                  {kpi.trendLabel ?? kpi.label}
                </p>
                <p className="text-[var(--text)] font-black text-xl tabular-nums leading-none">
                  {kpi.value}
                </p>
                <p className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-widest">
                  {kpi.label}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USAGE EXAMPLE (in your player page server component):
//
//   <PlayerHeader
//     playerName="Isaiah Hartenstein"
//     teamAbbr="OKC"
//     position="C"
//     photoUrl={`https://ak-static.cms.nba.com/wp-content/uploads/headshots/nba/latest/260x190/${player.nba_id}.png`}
//     teamLogoUrl="https://a.espncdn.com/i/teamlogos/nba/500/okc.png"
//     initials="IH"
//     nextGame={{
//       opponent: "SAS",
//       opponentLogo: "https://a.espncdn.com/i/teamlogos/nba/500/sa.png",
//       isHome: false,
//       date: game.date,
//       time: "20:30",
//     }}
//     kpis={[
//       { label: "Usage Rate",    value: "16.6%", trend: +1.2, trendLabel: "vs L10" },
//       { label: "Pot. Asistencias", value: "3.2", trend: -0.3, trendLabel: "vs L10" },
//       { label: "Chances Reb.", value: "14.0",  trend: +0.8, trendLabel: "vs L10" },
//       { label: "Toques",       value: "43.2",  trend: 0,    trendLabel: "vs L10" },
//     ]}
//   />
// ─────────────────────────────────────────────────────────────────────────────
