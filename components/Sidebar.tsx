"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Ticket,
  Users,
  Flame,
  Stethoscope,
  Trophy,
  Menu,
  X,
  Activity,
  Moon,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";



export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [expanded,setExpanded]=useState(false);
  const NAV_W=expanded?"md:w-[236px]":"md:w-[72px]";

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const isWNBAMode = pathname.startsWith("/wnba");

  const nbaItems = [
    { name: "Dashboard", path: "/", icon: <Home size={18} /> },
    { name: "Tickets NBA", path: "/tickets", icon: <Ticket size={18} /> },
    { name: "Analizar ticket", path: "/analizar-ticket", icon: <Ticket size={18} /> },
    { name: "Equipos", path: "/teams", icon: <Users size={18} /> },
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
          <span className="text-xl font-black italic uppercase tracking-tighter text-[var(--text)]">
            Mosk<span className="text-[var(--mosk-accent)]">Props</span>
          </span>
        </Link>
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 text-[var(--text-muted)] hover:text-[var(--mosk-accent)] transition-colors bg-[var(--surface-soft)] rounded-lg border border-[var(--border)]"
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
        data-expanded={expanded}
        className={`group fixed top-0 left-0 h-screen bg-[var(--surface)] border-r border-[var(--border)] flex flex-col z-[200] transition-all duration-300 ease-out
          w-72 ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0 ${NAV_W}`}
      >
        <div className="h-16 border-b border-[var(--border)] px-3 flex items-center gap-3 overflow-hidden">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="h-11 w-11 shrink-0 rounded-2xl border border-[var(--border-strong)] bg-[var(--mosk-active)] grid place-items-center">
              <span className="text-xs font-black italic text-[var(--mosk-accent)]">MP</span>
            </div>
            <div className="min-w-0 opacity-100 md:opacity-0 md:group-data-[expanded=true]:opacity-100 transition-opacity duration-200">
              <span className="whitespace-nowrap text-xl font-black italic uppercase tracking-tighter text-[var(--text)]">
                Mosk<span className="text-[var(--mosk-accent)]">Props</span>
              </span>

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

        <div className="p-2 border-b border-[var(--border)]">
          <div className="grid grid-cols-1 gap-1 md:grid-cols-1 md:group-data-[expanded=true]:grid-cols-2 rounded-2xl border border-[var(--border)] bg-[var(--bg)]/70 p-1">
            <Link
              href="/"
              title="NBA"
              className={`h-10 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                !isWNBAMode ? "bg-[var(--mosk-button)] text-[var(--mosk-button-text)]" : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-soft)]"
              }`}
            >
              <span>NBA</span>
            </Link>
            <Link
              href="/wnba"
              title="WNBA"
              className={`h-10 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                isWNBAMode ? "bg-[var(--mosk-button)] text-[var(--mosk-button-text)]" : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-soft)]"
              }`}
            >
              <span>W</span>
              <span className="hidden md:group-data-[expanded=true]:inline">NBA</span>
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
                aria-current={active?"page":undefined}
                className={`relative flex h-12 items-center gap-3 rounded-2xl border px-3 transition-all ${
                  active
                    ? "border-[var(--border-strong)] bg-[var(--mosk-active)] text-[var(--mosk-accent)]"
                    : "border-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
                }`}
              >
                {active && <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-[var(--mosk-button)]" />}
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-all ${active ? "bg-[var(--mosk-active)] text-[var(--mosk-accent)]" : "text-[var(--text-muted)]"}`}>
                  {item.icon}
                </div>
                <span className="whitespace-nowrap text-sm font-semibold opacity-100 md:opacity-0 md:group-data-[expanded=true]:opacity-100 transition-opacity duration-200">
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--border)] p-2 space-y-2 overflow-hidden">
          <button type="button" aria-label={expanded?"Contraer menú lateral":"Expandir menú lateral"} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)} className="hidden md:flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] text-[var(--mosk-accent)]"><Menu size={17}/>{expanded&&<span className="text-xs">Contraer menú</span>}</button>
          <div className="hidden md:block"><ThemeToggle compact={!expanded}/></div>

          <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)]/55 p-2">
            <div className="h-9 w-9 shrink-0 rounded-full border border-[#10b981]/25 bg-[var(--mosk-active)] grid place-items-center">
              <span className="text-[10px] font-black text-[var(--mosk-accent)]">PRO</span>
            </div>
            <div className="min-w-0 opacity-100 md:opacity-0 md:group-data-[expanded=true]:opacity-100 transition-opacity duration-200">
              <p className="whitespace-nowrap text-[10px] font-black uppercase tracking-widest text-[var(--text)]">Acceso privado</p>
              <p className="whitespace-nowrap text-[9px] font-bold text-[var(--text-muted)]">v1.0 Alpha</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
