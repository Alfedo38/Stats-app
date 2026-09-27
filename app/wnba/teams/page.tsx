import { requirePageUser } from '@/lib/auth/server';
import { createClient } from "@supabase/supabase-js";
import { Shield, Trophy, TrendingUp, Users } from "lucide-react";
import WNBATeamDirectory, { type WNBATeamDirectoryRow } from "@/components/wnba/WNBATeamDirectory";

export const dynamic = "force-dynamic";

type TeamRow = WNBATeamDirectoryRow & { season: string | null; season_type: string | null };

function pct(value: number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${(parsed * 100).toFixed(1)}%` : "—";
}

function StatStrip({ teams }: { teams: TeamRow[] }) {
  const best = teams[0];
  const stats = [
    { icon: Shield, label: "Equipos", value: String(teams.length) },
    { icon: Trophy, label: "Mejor récord", value: best?.team_abbr || "—" },
    { icon: TrendingUp, label: "Win rate", value: pct(best?.w_pct) },
    { icon: Users, label: "Temporada", value: "2026" },
  ];
  return <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(({ icon: Icon, label, value }) => <div key={label} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"><Icon size={16} className="text-[#10b981]" /><div><p className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{label}</p><p className="mt-0.5 text-xl font-black tracking-tighter">{value}</p></div></div>)}</section>;
}

export default async function WNBATeamsPage() {
  await requirePageUser();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return <main className="min-h-screen p-6 text-[var(--text)]">Faltan variables de Supabase.</main>;

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.from("v_wnba_teams").select("*").eq("season", "2026").eq("season_type", "Regular Season").order("w_pct", { ascending: false });
  const teams = (data ?? []) as TeamRow[];

  return (
    <main className="min-h-screen p-4 pt-20 text-[var(--text)] md:p-8 md:pt-8">
      <div className="mx-auto max-w-[1500px]">
        <section className="mb-5 rounded-[1.6rem] border border-[var(--border)] bg-[var(--surface)]/55 px-6 py-6 md:px-8">
          <p className="text-[9px] font-black uppercase tracking-[0.34em] text-[#10b981]">Directorio de equipos</p>
          <h1 className="mt-2 text-4xl font-black italic uppercase leading-none tracking-tighter md:text-5xl">Franquicias <span className="text-[#10b981]">WNBA</span></h1>
          <p className="mt-3 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)] md:text-xs">Elegí un equipo para abrir su plantel</p>
        </section>
        {error && <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold">{error.message}</div>}
        <StatStrip teams={teams} />
        <WNBATeamDirectory teams={teams} />
      </div>
    </main>
  );
}
