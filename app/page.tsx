import { requirePageUser } from '@/lib/auth/server';
// app/page.tsx — Home Page completa
import Link from "next/link";
import { Ticket, CalendarDays, ChevronLeft, ChevronRight, Users, TrendingUp, Zap, ShieldCheck } from "lucide-react";
import { getTodayScoreboard, getTopPerformers } from "@/lib/api";
import {getJornadaSchedule,getNbaSlateSchedule} from "@/lib/nbaJornadaData";
import {validDate} from "@/lib/matchupFilters";
import GameCarousel      from "@/components/GameCarousel";
import TopPerformersGrid from "@/components/TopPerformersGrid";
import SearchBar         from "@/components/SearchBar";
import ThemeToggle       from "@/components/ThemeToggle";
import RecentPlayers      from "@/components/RecentPlayers";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "MoskProps | Centro de análisis",
  description: "Props, tendencias, hit rates y enfrentamientos del día.",
};

// ─── Quick access cards ────────────────────────────────────────────────────────

const QUICK_LINKS = [
  {
    href:    "/tickets",
    icon:    Ticket,
    color:   "#10b981",
    title:   "Tickets NBA",
    desc:    "Selecciones x2 y x5 por partido y casa de apuestas.",
  },
  {
    href:    "/trending",
    icon:    TrendingUp,
    color:   "#3b82f6",
    title:   "On Fire",
    desc:    "Jugadores por partido, estadísticas recientes y cuotas por línea.",
  },
  {
    href:    "/teams",
    icon:    Users,
    color:   "#8b5cf6",
    title:   "Equipos",
    desc:    "Planteles, estadísticas y métricas de las 30 franquicias.",
  },
  {
    href:    "/wnba",
    icon:    Zap,
    color:   "#f59e0b",
    title:   "WNBA",
    desc:    "Análisis de props para la temporada WNBA con las mismas herramientas.",
  },
];

// ─── Page ──────────────────────────────────────────────────────────────────────

function argentinaToday() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

export default async function Home(props: { searchParams?: Promise<{ date?: string; slate?: string }> | { date?: string; slate?: string } }) {
  await requirePageUser();
  const searchParams = await Promise.resolve(props.searchParams || {});
  const today = argentinaToday();
  const requestedDate = validDate(searchParams.date) || today;
  const nbaSlate = searchParams.slate !== 'arg';
  const dayHref = (date: string) => '/?'+new URLSearchParams({date,...(nbaSlate?{}:{slate:'arg'})});
  const previousDate = shiftDate(requestedDate, -1);
  const nextDate = shiftDate(requestedDate, 1);
  const [games, schedule, performers] = await Promise.all([
    getTodayScoreboard(requestedDate),
    (nbaSlate ? getNbaSlateSchedule(requestedDate) : getJornadaSchedule(requestedDate).then(games=>({games,partial:false}))).catch(()=>null),
    getTopPerformers(),
  ]);

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] pb-20">

      {/* ── Sticky nav ─────────────────────────────────────────────────────── */}
      <nav className="border-b border-[var(--border)] bg-[var(--surface)]/95 px-4 md:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-[#10b981] rounded-lg flex items-center justify-center shrink-0">
            <ShieldCheck size={14} className="text-black" />
          </div>
          <span className="text-sm font-black uppercase tracking-widest text-[var(--text)]">MoskProps</span>

        </div>
        <div className="flex items-center gap-3">
          <div className="w-full sm:w-64">
            <SearchBar />
          </div>
          <ThemeToggle />
        </div>
      </nav>

      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-7">

        <section className="space-y-3" aria-labelledby="nba-slate-heading">
          <div className="mosk-slate-heading">
            <h1 id="nba-slate-heading">Jornada NBA</h1>
            <div className="mosk-day-control">
            <Link aria-label="Día anterior" href={dayHref(previousDate)} className="mosk-date-button">
              <ChevronLeft size={14} /> <span>Anterior</span>
            </Link>
            <div className="mosk-day-date">
              <CalendarDays size={16} aria-hidden />
              <time dateTime={requestedDate}>{requestedDate === today ? "Hoy · " : ""}{shortDate(requestedDate)}</time>
            </div>
            <Link aria-label="Día siguiente" href={dayHref(nextDate)} className="mosk-date-button">
              <span>Siguiente</span> <ChevronRight size={14} />
            </Link>
          </div>
          </div>
          <GameCarousel games={games} schedule={schedule?.games??null} date={requestedDate} nbaSlate={nbaSlate} partial={schedule?.partial} checkedAt={Date.now()} />
        </section>

        <RecentPlayers />

        {/* ── Top performers ────────────────────────────────────────────────── */}
        <details className="space-y-3 rounded-2xl border border-[var(--border)] p-3"><summary className="qa-disclosure text-sm font-bold">Rachas de liga · últimos 5 partidos</summary><TopPerformersGrid performers={performers as any} /></details>

        {/* ── Quick access grid ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h3 className="text-base font-bold">
            Herramientas
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {QUICK_LINKS.map(({ href, icon: Icon, color, title, desc }) => (
              <Link
                key={href}
                href={href}
                className="mosk-tool"
              >
                <Icon size={20} style={{ color }} aria-hidden />
                <span>
                  <strong>{title}</strong>
                  <small>{desc}</small>
                </span>
                <ChevronRight size={16} aria-hidden />
              </Link>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}
