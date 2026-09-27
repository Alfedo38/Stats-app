import { requirePageUser } from '@/lib/auth/server';
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import WNBAQuickSwitcher, { type WNBASwitchTeam } from "@/components/wnba/WNBAQuickSwitcher";
import WNBATeamRoster, { type WNBATeamRosterRow } from "@/components/wnba/WNBATeamRoster";
import { getWNBATeamTheme } from "@/components/wnba/wnbaTeamColors";

export const dynamic = "force-dynamic";

type Params = Promise<{ teamId: string }>;
type TeamRow = { team_id: number; team_abbr: string | null; team_name: string | null; w: number | null; l: number | null; w_pct: number | null; plus_minus: number | null };
type PlayerRow = WNBATeamRosterRow & { team_id: number; team_abbr: string | null };

function pct(value: number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${(parsed * 100).toFixed(1)}%` : "—";
}

function signed(value: number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return `${parsed > 0 ? "+" : ""}${parsed.toFixed(1)}`;
}

export default async function WNBATeamPage({ params }: { params: Params }) {
  await requirePageUser();
  const { teamId } = await params;
  const season = "2026";
  const seasonType = "Regular Season";
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return <main className="min-h-screen p-6 text-[var(--text)]">Faltan variables de Supabase.</main>;

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const [teamRes, rosterRes, teamsRes] = await Promise.all([
    supabase.from("v_wnba_teams").select("*").eq("team_id", Number(teamId)).eq("season", season).eq("season_type", seasonType).maybeSingle(),
    supabase.from("v_wnba_current_roster").select("player_id, player_name, team_id, team_abbr, jersey, position, country").eq("team_id", Number(teamId)).order("player_name", { ascending: true }),
    supabase.from("v_wnba_teams").select("team_id, team_abbr, team_name").eq("season", season).eq("season_type", seasonType).order("team_name", { ascending: true }),
  ]);

  const team = teamRes.data as TeamRow | null;
  const roster = (rosterRes.data ?? []) as PlayerRow[];
  const abbr = String(team?.team_abbr || roster[0]?.team_abbr || "WNBA").toUpperCase();
  const theme = getWNBATeamTheme(abbr);
  const switchPlayers = roster.map((player) => ({ id: player.player_id, player_name: player.player_name }));

  return (
    <main className="min-h-screen p-4 pb-24 pt-20 text-[var(--text)] md:p-8 md:pb-24 md:pt-8" style={{ background: `radial-gradient(circle at 8% 0%, ${theme.primary}12, transparent 27%), var(--bg)` }}>
      <div className="mx-auto max-w-[1500px]">
        <Link href="/wnba/teams" className="mb-6 inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.24em] text-[var(--text-muted)] transition hover:text-white"><ArrowLeft size={13} /> Volver a equipos</Link>

        <section className="relative mb-6 overflow-hidden rounded-[1.65rem] border px-6 py-6 md:px-8" style={{ borderColor: `${theme.primary}35`, background: `linear-gradient(135deg, ${theme.primary}0e, rgba(4,8,14,.98) 52%)` }}>
          <div className="pointer-events-none absolute -right-6 -top-12 text-[9rem] font-black italic leading-none opacity-[0.035]" style={{ color: theme.primary }}>{abbr}</div>
          <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border text-xl font-black" style={{ borderColor: `${theme.primary}45`, background: `${theme.primary}0d`, color: theme.primary }}>{abbr}</div>
              <div><p className="text-[9px] font-black uppercase tracking-[0.3em]" style={{ color: theme.primary }}>Plantel actual</p><h1 className="mt-1 text-4xl font-black italic uppercase leading-none tracking-tighter md:text-5xl">{team?.team_name || abbr}</h1><p className="mt-2 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Temporada 2026 · {roster.length} jugadoras</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest">
              <span className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"><b className="text-white">{team?.w ?? "—"}–{team?.l ?? "—"}</b> récord</span>
              <span className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"><b style={{ color: theme.primary }}>{pct(team?.w_pct)}</b> efectividad</span>
              <span className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"><b className="text-white">{signed(team?.plus_minus)}</b> diferencial</span>
            </div>
          </div>
        </section>

        {(teamRes.error || rosterRes.error) && <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold">{teamRes.error?.message || rosterRes.error?.message}</div>}
        <WNBATeamRoster players={roster} accent={theme.primary} />
      </div>

      <WNBAQuickSwitcher teams={(teamsRes.data ?? []) as WNBASwitchTeam[]} players={switchPlayers} currentTeamId={teamId} teamAbbr={abbr} season={season} seasonType={seasonType} />
    </main>
  );
}
