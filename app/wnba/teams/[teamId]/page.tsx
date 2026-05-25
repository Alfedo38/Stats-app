import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, Activity, Search, Users } from "lucide-react";

export const dynamic = "force-dynamic";

type Params = Promise<{ teamId: string }>;

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

type PlayerRow = {
  player_id: number;
  player_name: string | null;
  team_id: number;
  team_abbr: string | null;
  jersey: string | null;
  position: string | null;
  height: string | null;
  experience: number | null;
  school: string | null;
  country: string | null;
  is_active?: number | boolean | null;
  season: string | null;
  season_type: string | null;
  gp: number | null;
  min: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  turnovers?: number | null;
  ts_pct: number | null;
  usg_pct: number | null;
  pie: number | null;
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

function initials(name: string | null | undefined) {
  if (!name) return "WN";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function qs(params: Record<string, string>) {
  return `?${new URLSearchParams(params).toString()}`;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-black/10 px-3 py-2">
      <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <p className="text-sm font-black tracking-tight text-[var(--text)]">{value}</p>
    </div>
  );
}

export default async function WNBATeamPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams?: RawSearchParams;
}) {
  const { teamId } = await params;
  const sp = await Promise.resolve(searchParams ?? {});
  const season = getOne(sp.season, "2026");
  const seasonType = getOne(sp.season_type, "Regular Season");
  const q = getOne(sp.q, "");

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

  let rosterQuery = supabase
    .from("v_wnba_team_roster")
    .select("*")
    .eq("team_id", Number(teamId))
    .eq("season", season)
    .eq("season_type", seasonType)
    .order("pts", { ascending: false });

  if (q.trim()) {
    rosterQuery = rosterQuery.ilike("player_name", `%${q.trim()}%`);
  }

  const [teamRes, rosterRes] = await Promise.all([
    supabase
      .from("v_wnba_teams")
      .select("*")
      .eq("team_id", Number(teamId))
      .eq("season", season)
      .eq("season_type", seasonType)
      .maybeSingle(),
    rosterQuery,
  ]);

  const team = teamRes.data as TeamRow | null;
  const roster = (rosterRes.data ?? []) as PlayerRow[];
  const abbr = team?.team_abbr ?? roster[0]?.team_abbr ?? "WNBA";

  return (
    <main className="min-h-screen p-4 pt-20 md:pt-8 md:p-8 text-[var(--text)]">
      <section className="mb-6">
        <Link
          href={`/wnba/teams${qs({ season, season_type: seasonType })}`}
          className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-[var(--text-muted)] hover:text-[#10b981] transition-colors"
        >
          <ArrowLeft size={14} />
          Volver a equipos
        </Link>
      </section>

      <section className="max-w-6xl">
        <div className="rounded-[1.6rem] border border-[var(--border)] bg-[var(--surface)] px-5 py-5 md:px-7 md:py-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-full bg-[var(--surface-soft)] border border-[var(--border)] flex items-center justify-center text-3xl font-black text-[#10b981]">
                {abbr}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#10b981]">
                  Plantel analítico
                </p>
                <h1 className="mt-1 text-4xl md:text-6xl font-black italic uppercase tracking-tighter leading-none">
                  {abbr}
                </h1>
                <p className="mt-2 text-[11px] md:text-xs font-black uppercase tracking-[0.24em] text-[var(--text-muted)]">
                  {team?.team_name ?? "Equipo WNBA"} · {season} · {seasonType}
                </p>
              </div>
            </div>

            <form className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full lg:w-auto lg:min-w-[420px]">
              <select
                name="season"
                defaultValue={season}
                className="bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl px-4 py-3 text-xs font-black outline-none"
              >
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
              </select>

              <select
                name="season_type"
                defaultValue={seasonType}
                className="bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl px-4 py-3 text-xs font-black outline-none"
              >
                <option value="Regular Season">Regular Season</option>
                <option value="Playoffs">Playoffs</option>
              </select>

              <button className="rounded-xl bg-[#10b981] text-black px-4 py-3 text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition">
                Filtrar
              </button>
            </form>
          </div>
        </div>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MiniMetric label="Récord" value={`${team?.w ?? "—"}-${team?.l ?? "—"}`} />
          <MiniMetric label="Win rate" value={pct(team?.w_pct)} />
          <MiniMetric label="PTS" value={fmt(team?.pts)} />
          <MiniMetric label="Plus/minus" value={signed(team?.plus_minus)} />
        </section>

        <section className="mb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-[var(--text-muted)]">
              <Users size={13} />
              Jugadoras activas ({roster.length})
            </div>
          </div>

          <form className="relative w-full md:w-[320px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input type="hidden" name="season" value={season} />
            <input type="hidden" name="season_type" value={seasonType} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar jugadora..."
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-3 text-xs font-black outline-none placeholder:text-[var(--text-muted)]"
            />
          </form>
        </section>

        {(teamRes.error || rosterRes.error) && (
          <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold">
            {teamRes.error?.message || rosterRes.error?.message}
          </div>
        )}

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {roster.map((player, index) => (
            <Link
              key={`${player.player_id}-${season}-${seasonType}`}
              href={`/wnba/players/${player.player_id}${qs({ season, season_type: seasonType })}`}
              className="group rounded-2xl bg-[var(--surface)] border border-[var(--border)] px-4 py-4 hover:bg-[var(--surface-soft)] hover:border-[#10b981]/45 transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="w-13 h-13 min-w-13 rounded-2xl bg-[var(--surface-soft)] border border-[var(--border)] flex items-center justify-center text-base font-black text-[var(--text-muted)] group-hover:text-black group-hover:bg-[#10b981] group-hover:border-[#10b981] transition-all">
                  {initials(player.player_name)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-black uppercase tracking-tight leading-tight text-[var(--text)] group-hover:text-[#10b981] transition-colors truncate">
                        {player.player_name ?? "Jugadora"}
                      </h2>

                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        {player.position ?? "POS —"} · {player.country ?? "WNBA"} · Rank #{index + 1}
                      </p>
                    </div>

                    <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-[#10b981]">
                      Ver análisis →
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-[var(--border)] bg-black/10 px-3 py-2">
                      <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">PTS</p>
                      <p className="text-sm font-black tabular-nums">{fmt(player.pts)}</p>
                    </div>

                    <div className="rounded-xl border border-[var(--border)] bg-black/10 px-3 py-2">
                      <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">REB</p>
                      <p className="text-sm font-black tabular-nums">{fmt(player.reb)}</p>
                    </div>

                    <div className="rounded-xl border border-[var(--border)] bg-black/10 px-3 py-2">
                      <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">AST</p>
                      <p className="text-sm font-black tabular-nums">{fmt(player.ast)}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    <span>GP {player.gp ?? "—"}</span>
                    <span>MIN {fmt(player.min)}</span>
                    <span>TS {pct(player.ts_pct)}</span>
                    <span>USG {pct(player.usg_pct)}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}

          {roster.length === 0 && (
            <div className="col-span-full rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-10 text-center">
              <Activity size={22} className="mx-auto mb-3 text-[var(--text-muted)]" />
              <p className="text-sm font-black uppercase tracking-widest text-[var(--text-muted)]">
                Sin jugadoras para este filtro
              </p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}