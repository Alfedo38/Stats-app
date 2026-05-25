import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { Shield, Trophy, Users, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

type RawSearchParams =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

type TeamRow = {
  team_id: number;
  team_abbr: string | null;
  team_name: string | null;
  season: string | null;
  season_type: string | null;
  gp: number | null;
  w: number | null;
  l: number | null;
  w_pct: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  plus_minus: number | null;
};

function getOne(value: string | string[] | undefined, fallback: string) {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function fmt(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function signed(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
}

function qs(params: Record<string, string>) {
  return `?${new URLSearchParams(params).toString()}`;
}

function StatStrip({ teams, season }: { teams: TeamRow[]; season: string }) {
  const best = teams[0];
  const avgPts = teams.length
    ? teams.reduce((acc, t) => acc + Number(t.pts ?? 0), 0) / teams.length
    : null;

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] px-5 py-4 flex items-center gap-3">
        <Shield size={18} className="text-[#10b981]" />
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Equipos</p>
          <p className="text-2xl font-black tracking-tighter">{teams.length}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] px-5 py-4 flex items-center gap-3">
        <Trophy size={18} className="text-[#10b981]" />
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Mejor récord</p>
          <p className="text-2xl font-black tracking-tighter">{best?.team_abbr ?? "—"}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] px-5 py-4 flex items-center gap-3">
        <TrendingUp size={18} className="text-[#10b981]" />
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Win rate</p>
          <p className="text-2xl font-black tracking-tighter">{pct(best?.w_pct)}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] px-5 py-4 flex items-center gap-3">
        <Users size={18} className="text-[#10b981]" />
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Temporada</p>
          <p className="text-2xl font-black tracking-tighter">{season}</p>
        </div>
      </div>
    </section>
  );
}

export default async function WNBATeamsPage({ searchParams }: { searchParams?: RawSearchParams }) {
  const sp = await Promise.resolve(searchParams ?? {});
  const season = getOne(sp.season, "2026");
  const seasonType = getOne(sp.season_type, "Regular Season");

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return (
      <main className="min-h-screen p-6 text-[var(--text)]">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 font-bold">
          Faltan variables de Supabase.
        </div>
      </main>
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from("v_wnba_teams")
    .select("*")
    .eq("season", season)
    .eq("season_type", seasonType)
    .order("w_pct", { ascending: false });

  const teams = (data ?? []) as TeamRow[];

  return (
    <main className="min-h-screen p-4 pt-20 md:pt-8 md:p-8 text-[var(--text)]"><div className="max-w-[1500px] mx-auto">
      <section className="mb-5">
        <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)]/45 px-5 py-6 md:px-7 md:py-7 flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#10b981]">
              WNBA Database
            </p>
            <h1 className="mt-2 text-5xl md:text-7xl font-black italic uppercase tracking-tighter leading-none text-balance">
              Franquicias <span className="text-[#10b981]">WNBA</span>
            </h1>
            <p className="mt-3 text-xs md:text-sm text-[var(--text-muted)] font-black uppercase tracking-[0.24em]">
              Seleccioná un equipo para ver su plantel analítico
            </p>
          </div>

          <form className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full xl:w-auto xl:min-w-[360px]">
            <select
              name="season"
              defaultValue={season}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-xs font-black outline-none"
            >
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>

            <select
              name="season_type"
              defaultValue={seasonType}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-xs font-black outline-none"
            >
              <option value="Regular Season">Regular Season</option>
              <option value="Playoffs">Playoffs</option>
            </select>

            <button className="rounded-xl bg-[#10b981] text-black px-5 py-3 text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition">
              Filtrar
            </button>
          </form>
        </div>
      </section>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold">
          {error.message}
        </div>
      )}

      <StatStrip teams={teams} season={season} />

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
        {teams.map((team) => {
          const abbr = team.team_abbr ?? "WNBA";
          return (
            <Link
              key={`${team.team_id}-${season}-${seasonType}`}
              href={`/wnba/teams/${team.team_id}${qs({ season, season_type: seasonType })}`}
              className="group rounded-2xl bg-[var(--surface)] border border-[var(--border)] px-4 py-4 min-h-[190px] hover:bg-[var(--surface-soft)] hover:border-[#10b981]/45 transition-all flex flex-col justify-between text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="w-14 h-14 rounded-2xl bg-[var(--surface-soft)] border border-[var(--border)] flex items-center justify-center text-xl font-black text-[var(--text-muted)] group-hover:text-[#10b981] group-hover:border-[#10b981]/40 transition-all">
                  {abbr}
                </div>

                <div className="rounded-full border border-[var(--border)] bg-black/15 px-2.5 py-1 text-[9px] font-black text-[var(--text-muted)] tabular-nums">
                  {team.w ?? "—"}-{team.l ?? "—"}
                </div>
              </div>

              <div className="mt-4">
                <h2 className="text-sm font-black uppercase tracking-tight leading-tight text-[var(--text)] group-hover:text-[#10b981] transition-colors">
                  {team.team_name ?? abbr}
                </h2>

                <p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-[#10b981]">
                  Ver plantel →
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-[var(--border)] bg-black/10 px-3 py-2">
                  <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">Win</p>
                  <p className="text-sm font-black tabular-nums">{pct(team.w_pct)}</p>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-black/10 px-3 py-2">
                  <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">PTS</p>
                  <p className="text-sm font-black tabular-nums">{fmt(team.pts)}</p>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-black/10 px-3 py-2">
                  <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">REB</p>
                  <p className="text-sm font-black tabular-nums">{fmt(team.reb)}</p>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-black/10 px-3 py-2">
                  <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">+/-</p>
                  <p className="text-sm font-black tabular-nums">{signed(team.plus_minus)}</p>
                </div>
              </div>
            </Link>
          );
        })}

        {teams.length === 0 && (
          <div className="col-span-full rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-10 text-center text-[var(--text-muted)] font-black uppercase tracking-widest">
            No hay equipos para este filtro
          </div>
        )}
      </section>
      </div>
    </main>
  );
}