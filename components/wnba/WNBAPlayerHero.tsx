import Link from "next/link";
import { ArrowLeft, IdCard, MapPin } from "lucide-react";
import type { WNBAPlayerRow } from "./types";
import { initials, qs, splitName } from "./utils";

export default function WNBAPlayerHero({
  playerName,
  profile,
  teamId,
  season,
  seasonType,
}: {
  playerName: string;
  profile: WNBAPlayerRow | null;
  teamId?: number | null;
  season: string;
  seasonType: string;
}) {
  const { firstName, lastName } = splitName(playerName);

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.10),transparent_30%),var(--surface)] p-5 shadow-2xl md:p-8">
      <div className="mb-7 flex items-center justify-between gap-3">
        <Link
          href={teamId ? `/wnba/teams/${teamId}${qs({ season, season_type: seasonType })}` : "/wnba/players"}
          className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-[var(--text-muted)] transition hover:text-[#10b981]"
        >
          <ArrowLeft size={14} /> Volver
        </Link>
        <span className="rounded-full border border-[#10b981]/25 bg-[#10b981]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-[#10b981]">
          Player Analytics
        </span>
      </div>

      <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-[#10b981]">
            <span className="h-2 w-2 rounded-full bg-[#10b981]" /> WNBA Database
          </p>
          <h1 className="text-[clamp(2.8rem,7vw,6.8rem)] font-black italic uppercase leading-[0.86] tracking-tighter text-[var(--text)]">
            {firstName}
            <br />
            <span className="text-[#10b981]">{lastName}</span>
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            <span className="rounded-full border border-[var(--border)] bg-black/15 px-3 py-1">{profile?.team_abbr || "WNBA"}</span>
            {profile?.jersey && <span className="rounded-full border border-[var(--border)] bg-black/15 px-3 py-1">#{profile.jersey}</span>}
            {profile?.position && <span className="rounded-full border border-[var(--border)] bg-black/15 px-3 py-1">{profile.position}</span>}
            <span className="rounded-full border border-[var(--border)] bg-black/15 px-3 py-1">{season}</span>
            <span className="rounded-full border border-[var(--border)] bg-black/15 px-3 py-1">{seasonType}</span>
          </div>
        </div>

        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[2rem] border border-[var(--border)] bg-[var(--surface-soft)] text-3xl font-black text-[var(--text-muted)] shadow-xl md:h-32 md:w-32 md:text-5xl">
          {initials(playerName)}
        </div>
      </div>

      <div className="mt-7 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-black/15 p-4">
          <p className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            <IdCard size={14} className="text-[#10b981]" /> Perfil
          </p>
          <p className="text-sm font-bold text-[var(--text)]">
            {[profile?.height, profile?.school].filter(Boolean).join(" · ") || "Sin datos extra de perfil"}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-black/15 p-4">
          <p className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            <MapPin size={14} className="text-[#10b981]" /> Origen
          </p>
          <p className="text-sm font-bold text-[var(--text)]">{profile?.country || "WNBA"}</p>
        </div>
      </div>
    </section>
  );
}
