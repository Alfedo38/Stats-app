import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { Search, Users } from "lucide-react";
import { getWNBATeamTheme } from "@/components/wnba/wnbaTeamColors";

export const dynamic = "force-dynamic";

type RawSearchParams =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

type PlayerRow = {
  player_id: number;
  player_name: string | null;
  team_abbr: string | null;
  position: string | null;
  gp: number | null;
  min: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  season: string | null;
  season_type: string | null;
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

function initials(name: string | null | undefined) {
  const parts = String(name || "WN").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function sortColumn(sort: string) {
  if (["pts", "reb", "ast", "min", "gp", "stl", "blk"].includes(sort)) return sort;
  return "pts";
}

export default async function WNBAPlayersPage({ searchParams }: { searchParams?: RawSearchParams }) {
  const sp = await Promise.resolve(searchParams ?? {});
  const q = getOne(sp.q, "").trim();
  const sort = sortColumn(getOne(sp.sort, "pts"));
  const season = getOne(sp.season, "2026");
  const seasonType = getOne(sp.season_type, "Regular Season");

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return <main className="min-h-screen p-6 text-[var(--text)]">Faltan variables de Supabase.</main>;
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  let query = supabase
    .from("v_wnba_team_roster")
    .select("player_id, player_name, team_abbr, position, gp, min, pts, reb, ast, stl, blk, season, season_type")
    .eq("season", season)
    .eq("season_type", seasonType)
    .order(sort, { ascending: false })
    .limit(120);

  if (q) query = query.ilike("player_name", `%${q}%`);

  const { data, error } = await query;
  const players = (data ?? []) as PlayerRow[];

  return (
    <main className="min-h-screen p-4 pt-20 md:p-8 md:pt-8 text-[var(--text)]" style={{ background: "radial-gradient(circle at 8% 0%, rgba(16,185,129,.16), transparent 28%), radial-gradient(circle at 100% 18%, rgba(124,58,237,.13), transparent 22%), var(--bg)" }}>
      <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[#10b981] flex items-center gap-2"><Users size={13} /> WNBA</p>
          <h1 className="mt-1 text-4xl md:text-6xl font-black italic uppercase tracking-tighter leading-none">Jugadoras</h1>
        </div>

        <form className="flex flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#07131a] px-3 py-2">
            <Search size={15} className="text-[var(--text-muted)]" />
            <input name="q" defaultValue={q} placeholder="Buscar jugadora..." className="bg-transparent outline-none text-sm font-black" />
          </div>
          <select name="sort" defaultValue={sort} className="rounded-xl border border-white/10 bg-[#07131a] px-3 py-2 text-xs font-black uppercase text-white outline-none">
            <option value="pts">PTS</option>
            <option value="reb">REB</option>
            <option value="ast">AST</option>
            <option value="min">MIN</option>
            <option value="stl">STL</option>
            <option value="blk">BLK</option>
          </select>
          <button className="rounded-xl bg-[#10b981] px-4 py-2 text-xs font-black uppercase tracking-widest text-black">Aplicar</button>
        </form>
      </section>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-300">
          {error.message}
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {players.map((p) => {
          const theme = getWNBATeamTheme(p.team_abbr);
          return (
            <Link
              key={p.player_id}
              href={`/wnba/players/${p.player_id}?season=${season}&season_type=${encodeURIComponent(seasonType)}`}
              className="rounded-[1.4rem] border p-4 transition-colors"
              style={{ borderColor: `${theme.primary}28`, background: `linear-gradient(135deg, ${theme.soft}, rgba(4,8,14,.94))` }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="h-12 w-12 rounded-2xl border flex items-center justify-center text-sm font-black"
                  style={{ borderColor: `${theme.primary}55`, background: theme.soft, color: theme.primary }}
                >
                  {initials(p.player_name)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-black uppercase tracking-tight">{p.player_name || "Jugadora"}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{p.team_abbr || "WNBA"} · {p.position || "S/P"}</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <Metric label="PTS" value={fmt(p.pts)} color={theme.primary} />
                <Metric label="REB" value={fmt(p.reb)} />
                <Metric label="AST" value={fmt(p.ast)} />
                <Metric label="MIN" value={fmt(p.min)} />
              </div>
            </Link>
          );
        })}
      </section>
    </main>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#03070c] px-3 py-2 text-right">
      <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <p className="text-lg font-black tracking-tighter" style={{ color }}>{value}</p>
    </div>
  );
}
