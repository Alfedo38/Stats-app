"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Zap,
  Users,
  Flame,
  MessageSquare,
  Stethoscope,
  Trophy,
  Menu,
  X,
  Activity,
  Moon,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const NAV_W = "md:w-[72px] md:hover:w-[236px]";

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const isWNBAMode = pathname.startsWith("/wnba");

  const nbaItems = [
    { name: "Dashboard", path: "/", icon: <Home size={18} /> },
    { name: "Cerebro EV+", path: "/ev-plays", icon: <Zap size={18} /> },
    { name: "Equipos", path: "/teams", icon: <Users size={18} /> },
    { name: "Radar Social", path: "/reddit-hype", icon: <MessageSquare size={18} /> },
    { name: "Parte Médico", path: "/injuries", icon: <Stethoscope size={18} /> },
    { name: "On Fire", path: "/trending", icon: <Flame size={18} /> },
  ];

  const wnbaItems = [
    { name: "Dashboard", path: "/wnba", icon: <Activity size={18} /> },
    { name: "Equipos", path: "/wnba/teams", icon: <Users size={18} /> },
    { name: "Jugadoras", path: "/wnba/players", icon: <Trophy size={18} /> },
  ];

  const activeItems = isWNBAMode ? wnbaItems : nbaItems;

  const isActivePath = (path: string) => {
    if (path === "/") return pathname === "/";
    if (path === "/wnba") return pathname === "/wnba";
    return pathname.startsWith(path);
  };

  return (
    <>
      <div className="md:hidden fixed top-0 left-0 w-full h-16 bg-[var(--surface)]/95 backdrop-blur-md border-b border-[var(--border)] flex items-center justify-between px-4 z-[150]">
        <Link href="/" className="flex items-center gap-2">
          <h1 className="text-xl font-black italic uppercase tracking-tighter text-[var(--text)]">
            Mosk<span className="text-[#10b981]">Props</span>
          </h1>
        </Link>
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 text-[var(--text-muted)] hover:text-[#10b981] transition-colors bg-[var(--surface-soft)] rounded-lg border border-[var(--border)]"
          aria-label="Abrir menú"
        >
          <Menu size={20} />
        </button>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[190] md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`group fixed top-0 left-0 h-screen bg-black/95 backdrop-blur-xl border-r border-[#10b981]/15 flex flex-col z-[200] transition-all duration-300 ease-out shadow-2xl shadow-black/30
          w-72 ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0 ${NAV_W}`}
      >
        <div className="h-16 border-b border-[#10b981]/10 px-3 flex items-center gap-3 overflow-hidden">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="h-11 w-11 shrink-0 rounded-2xl border border-[#10b981]/35 bg-[#10b981]/10 grid place-items-center shadow-[0_0_18px_rgba(16,185,129,0.12)]">
              <span className="text-xs font-black italic text-[#10b981]">MP</span>
            </div>
            <div className="min-w-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
              <h1 className="whitespace-nowrap text-xl font-black italic uppercase tracking-tighter text-[var(--text)]">
                Mosk<span className="text-[#10b981]">Props</span>
              </h1>
              <p className="text-[8px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">Player analytics</p>
            </div>
          </Link>

          <button
            onClick={() => setIsOpen(false)}
            className="ml-auto md:hidden p-1 text-[var(--text-muted)] hover:text-[var(--text)] bg-[var(--surface-soft)] rounded-md border border-[var(--border)]"
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-2 border-b border-[#10b981]/10">
          <div className="grid grid-cols-1 gap-1 md:grid-cols-1 md:group-hover:grid-cols-2 rounded-2xl border border-[var(--border)] bg-[var(--bg)]/70 p-1">
            <Link
              href="/"
              title="NBA"
              className={`h-10 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                !isWNBAMode ? "bg-[#10b981] text-black" : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-soft)]"
              }`}
            >
              <span>NBA</span>
            </Link>
            <Link
              href="/wnba"
              title="WNBA"
              className={`h-10 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                isWNBAMode ? "bg-[#10b981] text-black" : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-soft)]"
              }`}
            >
              <span>W</span>
              <span className="hidden md:group-hover:inline">NBA</span>
              <span className="md:hidden">NBA</span>
            </Link>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1 hide-scrollbar">
          {activeItems.map((item) => {
            const active = isActivePath(item.path);
            return (
              <Link
                key={item.name}
                href={item.path}
                title={item.name}
                className={`relative flex h-12 items-center gap-3 rounded-2xl border px-3 transition-all ${
                  active
                    ? "border-[#10b981]/35 bg-[#10b981]/10 text-[#10b981] shadow-[0_0_18px_rgba(16,185,129,0.08)]"
                    : "border-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
                }`}
              >
                {active && <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-[#10b981]" />}
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-all ${active ? "bg-[#10b981]/10 text-[#10b981]" : "text-[var(--text-muted)]"}`}>
                  {item.icon}
                </div>
                <span className="whitespace-nowrap text-xs font-black uppercase tracking-widest opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[#10b981]/10 p-2 space-y-2 overflow-hidden">
          <div className="hidden md:block">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <ThemeToggle />
            </div>
            <div className="group-hover:hidden h-11 rounded-2xl border border-[var(--border)] bg-[var(--bg)]/60 grid place-items-center text-[var(--text-muted)]">
              <Moon size={16} />
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)]/55 p-2">
            <div className="h-9 w-9 shrink-0 rounded-full border border-[#10b981]/25 bg-[#10b981]/10 grid place-items-center">
              <span className="text-[10px] font-black text-[#10b981]">PRO</span>
            </div>
            <div className="min-w-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
              <p className="whitespace-nowrap text-[10px] font-black uppercase tracking-widest text-[var(--text)]">Acceso privado</p>
              <p className="whitespace-nowrap text-[9px] font-bold text-[var(--text-muted)]">v1.0 Alpha</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
