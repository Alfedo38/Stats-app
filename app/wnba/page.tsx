import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { CalendarDays, ChevronLeft, ChevronRight, Shield, Swords, Trophy, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

type RawSearchParams =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

type DailyGame = {
  id: number;
  source_event_id: string;
  game_date: string;
  scheduled_at: string | null;
  status_state: string | null;
  status_name: string | null;
  status_detail: string | null;
  away_team_abbr: string;
  away_team_name: string;
  away_team_logo: string | null;
  away_score: number | null;
  home_team_abbr: string;
  home_team_name: string;
  home_team_logo: string | null;
  home_score: number | null;
  home_win_prob: number | null;
  away_win_prob: number | null;
  home_win_pct: number | null;
  away_win_pct: number | null;
  h2h_home_wins: number | null;
  h2h_away_wins: number | null;
  h2h_total: number | null;
  model_note: string | null;
  updated_at: string | null;
};

function getOne(value: string | string[] | undefined, fallback: string) {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function argentinaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function qs(params: Record<string, string>) {
  return `?${new URLSearchParams(params).toString()}`;
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function score(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return String(value);
}

function timeAR(iso: string | null) {
  if (!iso) return "Horario a confirmar";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "Horario a confirmar";
  }
}

function statusLabel(game: DailyGame) {
  const state = String(game.status_state ?? "").toLowerCase();
  const name = String(game.status_name ?? "").toLowerCase();
  if (state === "post" || name.includes("final")) return "FINAL";
  if (state === "in" || name.includes("progress")) return "EN VIVO";
  return "PROGRAMADO";
}

function TeamMark({ abbr, name, logo }: { abbr: string; name: string; logo: string | null }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-11 h-11 rounded-2xl bg-[var(--surface-soft)] border border-[var(--border)] flex items-center justify-center overflow-hidden shrink-0">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={abbr} className="w-8 h-8 object-contain" />
        ) : (
          <span className="text-sm font-black text-[#10b981]">{abbr}</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-lg font-black uppercase tracking-tight truncate">{abbr}</p>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] truncate">{name}</p>
      </div>
    </div>
  );
}

function GameCard({ game }: { game: DailyGame }) {
  const label = statusLabel(game);
  const isFinal = label === "FINAL";
  const isLive = label === "EN VIVO";

  return (
    <div className="rounded-[1.7rem] bg-[var(--surface)] border border-[var(--border)] p-5 hover:border-[#10b981]/40 transition-all">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className={`px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${
          isLive
            ? "border-red-400/40 bg-red-500/10 text-red-300"
            : isFinal
              ? "border-[#10b981]/35 bg-[#10b981]/10 text-[#10b981]"
              : "border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-muted)]"
        }`}>
          {label}
        </div>
        <div className="text-right">
          <p className="text-sm font-black">{timeAR(game.scheduled_at)}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            {game.status_detail ?? game.game_date}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <TeamMark abbr={game.away_team_abbr} name={game.away_team_name} logo={game.away_team_logo} />
          <p className="text-4xl font-black tracking-tighter">{score(game.away_score)}</p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <TeamMark abbr={game.home_team_abbr} name={game.home_team_name} logo={game.home_team_logo} />
          <p className="text-4xl font-black tracking-tighter">{score(game.home_score)}</p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-[var(--surface-soft)] border border-[var(--border)] p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-[#10b981]" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Chances estimadas</p>
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            H2H {game.h2h_away_wins ?? 0}-{game.h2h_home_wins ?? 0}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-[var(--border)] p-3">
            <p className="text-[10px] font-black text-[var(--text-muted)]">{game.away_team_abbr}</p>
            <p className="text-2xl font-black">{pct(game.away_win_pct)}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-3">
            <p className="text-[10px] font-black text-[var(--text-muted)]">{game.home_team_abbr}</p>
            <p className="text-2xl font-black text-[#10b981]">{pct(game.home_win_pct)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function WNBADashboardPage({ searchParams }: { searchParams?: RawSearchParams }) {
  const sp = await Promise.resolve(searchParams ?? {});
  const today = argentinaToday();
  const selectedDate = getOne(sp.date, today);
  const prevDate = addDays(selectedDate, -1);
  const nextDate = addDays(selectedDate, 1);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return (
      <main className="min-h-screen p-6 text-[var(--text)]">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">Faltan variables de Supabase.</div>
      </main>
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from("v_wnba_daily_games")
    .select("*")
    .eq("game_date", selectedDate)
    .order("scheduled_at", { ascending: true });

  const games = (data ?? []) as DailyGame[];
  const liveCount = games.filter((g) => statusLabel(g) === "EN VIVO").length;
  const finalCount = games.filter((g) => statusLabel(g) === "FINAL").length;
  const scheduledCount = games.filter((g) => statusLabel(g) === "PROGRAMADO").length;

  return (
    <main className="min-h-screen p-4 pt-20 md:pt-8 md:p-8 text-[var(--text)]">
      <section className="relative overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_36%),var(--surface)] p-6 md:p-8 mb-6">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#10b981]">MoskProps WNBA</p>
            <h1 className="mt-2 text-5xl md:text-7xl font-black italic uppercase tracking-tighter leading-none">
              Jornada <span className="text-[#10b981]">WNBA</span>
            </h1>
            <p className="mt-4 text-sm text-[var(--text-muted)] font-bold uppercase tracking-widest">
              Partidos del día, resultados, historial y chances estimadas.
            </p>
          </div>

          <form className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
            <input
              type="date"
              name="date"
              defaultValue={selectedDate}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm font-black outline-none"
            />
            <button className="rounded-xl bg-[#10b981] text-black px-6 py-3 text-xs font-black uppercase tracking-widest">
              Ver fecha
            </button>
          </form>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-2 mb-6">
        <Link href={qs({ date: prevDate })} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-black uppercase tracking-widest hover:border-[#10b981]/40">
          <ChevronLeft size={14} /> Ayer
        </Link>
        <Link href={qs({ date: today })} className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest ${selectedDate === today ? "bg-[#10b981] text-black border-[#10b981]" : "border-[var(--border)] bg-[var(--surface)]"}`}>
          <CalendarDays size={14} /> Hoy
        </Link>
        <Link href={qs({ date: nextDate })} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-black uppercase tracking-widest hover:border-[#10b981]/40">
          Mañana <ChevronRight size={14} />
        </Link>
        <Link href="/wnba/teams" className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-black uppercase tracking-widest hover:border-[#10b981]/40">
          <Shield size={14} /> Equipos
        </Link>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5">
          <Swords className="text-[#10b981] mb-3" size={20} />
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Partidos</p>
          <p className="text-3xl font-black">{games.length}</p>
        </div>
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5">
          <Zap className="text-red-300 mb-3" size={20} />
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">En vivo</p>
          <p className="text-3xl font-black">{liveCount}</p>
        </div>
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5">
          <CalendarDays className="text-[#10b981] mb-3" size={20} />
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Programados</p>
          <p className="text-3xl font-black">{scheduledCount}</p>
        </div>
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5">
          <Trophy className="text-[#10b981] mb-3" size={20} />
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Finales</p>
          <p className="text-3xl font-black">{finalCount}</p>
        </div>
      </section>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm">{error.message}</div>
      )}

      {games.length === 0 ? (
        <section className="rounded-[2rem] bg-[var(--surface)] border border-[var(--border)] p-10 text-center">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#10b981]">Sin partidos registrados</p>
          <h2 className="mt-3 text-3xl font-black uppercase tracking-tight">No hay juegos para {selectedDate}</h2>
          <p className="mt-3 text-sm text-[var(--text-muted)] max-w-2xl mx-auto">
            Si debería haber partidos, corré el sync diario de WNBA para actualizar la tabla daily_games.
          </p>
        </section>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {games.map((game) => (
            <GameCard key={game.source_event_id} game={game} />
          ))}
        </section>
      )}
    </main>
  );
}
