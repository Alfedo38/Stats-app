// app/page.tsx — Home Page completa
import Link from "next/link";
import { Brain, ChevronRight, Users, TrendingUp, Zap, ShieldCheck } from "lucide-react";
import { getRedditTrends, getTodayScoreboard, getTopPerformers } from "@/lib/api";
import GameCarousel      from "@/components/GameCarousel";
import TopPerformersGrid from "@/components/TopPerformersGrid";
import HypeCarousel      from "@/components/HypeCarousel";
import SearchBar         from "@/components/SearchBar";
import ThemeToggle       from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "MoskProps | Centro de Comando NBA",
  description: "Análisis avanzado de props NBA: EV+, DvP, hit rates, radar social y matchups del día.",
};

// ─── Quick access cards ────────────────────────────────────────────────────────

const QUICK_LINKS = [
  {
    href:    "/ev-plays",
    icon:    Brain,
    color:   "#10b981",
    title:   "Cerebro EV+",
    desc:    "Algoritmo matemático para detectar valor en las líneas de hoy.",
    cta:     "Abrir escáner",
  },
  {
    href:    "/trending",
    icon:    TrendingUp,
    color:   "#3b82f6",
    title:   "On Fire",
    desc:    "Top performers de los últimos 5 partidos por PTS, REB y AST.",
    cta:     "Ver ranking",
  },
  {
    href:    "/teams",
    icon:    Users,
    color:   "#8b5cf6",
    title:   "Equipos",
    desc:    "Rosters, estadísticas y métricas de las 30 franquicias NBA.",
    cta:     "Explorar NBA",
  },
  {
    href:    "/wnba",
    icon:    Zap,
    color:   "#f59e0b",
    title:   "WNBA",
    desc:    "Análisis de props para la temporada WNBA con las mismas herramientas.",
    cta:     "Ver WNBA",
  },
];

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function Home() {
  const [trends, games, performers] = await Promise.all([
    getRedditTrends(),
    getTodayScoreboard(),
    getTopPerformers(),
  ]);

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] pb-20">

      {/* ── Sticky nav ─────────────────────────────────────────────────────── */}
      <nav className="border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md sticky top-0 z-50 px-4 md:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-[#10b981] rounded-lg flex items-center justify-center shrink-0">
            <ShieldCheck size={14} className="text-black" />
          </div>
          <span className="text-sm font-black uppercase tracking-widest text-[var(--text)]">MoskProps</span>
          <span className="hidden sm:block text-[8px] font-black uppercase tracking-[0.25em] text-[var(--text-muted)] border border-[var(--border)] px-2 py-0.5 rounded-full">
            NBA Analytics
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-full sm:w-64">
            <SearchBar />
          </div>
          <ThemeToggle />
        </div>
      </nav>

      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-10">

        {/* ── Hero header ─────────────────────────────────────────────────── */}
        <header className="pt-4">
          <p className="text-[9px] font-black uppercase tracking-[0.35em] text-[#10b981] flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse inline-block" />
            Centro de Comando
          </p>
          <h1 className="text-5xl md:text-7xl font-black italic uppercase tracking-tighter leading-none">
            Datos que<br />
            <span className="text-[#10b981]">ganan.</span>
          </h1>
          <p className="text-[var(--text-muted)] text-sm font-medium mt-3 max-w-lg">
            Análisis avanzado de props NBA con hit rates, DvP, radar social y EV+ para tomar mejores decisiones.
          </p>
        </header>

        {/* ── Cartelera del día ────────────────────────────────────────────── */}
        <GameCarousel games={games} />

        {/* ── Top performers ────────────────────────────────────────────────── */}
        <TopPerformersGrid performers={performers as any} />

        {/* ── Reddit Hype ─────────────────────────────────────────────────── */}
        <HypeCarousel trends={trends as any} />

        {/* ── Quick access grid ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] px-1">
            Herramientas
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {QUICK_LINKS.map(({ href, icon: Icon, color, title, desc, cta }) => (
              <Link
                key={href}
                href={href}
                className="group block bg-[var(--surface)] border border-[var(--border)] p-6 rounded-3xl hover:border-[var(--border-strong)] transition-all relative overflow-hidden"
              >
                {/* Background glow */}
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{ background: color }} />

                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5 border"
                    style={{ background: `${color}18`, borderColor: `${color}30` }}>
                    <Icon size={18} style={{ color }} />
                  </div>
                  <h2 className="text-base font-black uppercase tracking-tight mb-1.5" style={{ color }}>
                    {title}
                  </h2>
                  <p className="text-[var(--text-muted)] text-[11px] mb-5 leading-relaxed">{desc}</p>
                  <div className="flex items-center text-[9px] font-black uppercase tracking-widest transition-colors" style={{ color }}>
                    {cta}
                    <ChevronRight size={13} className="ml-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}
