"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Zap, Users, Flame, MessageSquare, Stethoscope, Trophy, Shield, Cpu, Globe, Menu, X } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const isLoLMode = pathname.startsWith('/lol');

  const nbaItems = [
    { name: 'Dashboard', path: '/', icon: <Home size={18} /> },
    { name: 'Cerebro EV+', path: '/ev-plays', icon: <Zap size={18} /> },
    { name: 'Equipos', path: '/teams', icon: <Users size={18} /> },
    { name: 'Radar Social', path: '/reddit-hype', icon: <MessageSquare size={18} /> },
    { name: 'Parte Médico', path: '/injuries', icon: <Stethoscope size={18} /> },
    { name: 'On Fire', path: '/trending', icon: <Flame size={18} /> },
  ];

  const lolItems = [
    { name: 'Dashboard', path: '/lol', icon: <Globe size={18} /> },
    { name: 'Ligas', path: '/lol/leagues', icon: <Trophy size={18} /> },
    { name: 'Equipos', path: '/lol/teams', icon: <Shield size={18} /> },
    { name: 'Jugadores', path: '/lol/players', icon: <Users size={18} /> },
    { name: 'Simulador Draft', path: '/lol/draft', icon: <Cpu size={18} /> },
  ];

  const activeItems = isLoLMode ? lolItems : nbaItems;

  return (
    <>
      {/* Top bar mobile */}
      <div className="md:hidden fixed top-0 left-0 w-full h-16 bg-[var(--surface)]/95 backdrop-blur-md border-b border-[var(--border)] flex items-center justify-between px-4 z-[150]">
        <Link href="/">
          <h1 className="text-xl font-black italic uppercase tracking-tighter text-[var(--text)]">
            Mosk<span className="text-[#10b981]">Props</span>
          </h1>
        </Link>
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 text-[var(--text-muted)] hover:text-[#10b981] transition-colors bg-[var(--surface-soft)] rounded-lg border border-[var(--border)]"
        >
          <Menu size={20} />
        </button>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm z-[190] md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`fixed top-0 left-0 h-screen w-64 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col z-[200] transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } md:translate-x-0`}>
        <div className="p-6 h-16 border-b border-[var(--border)] flex items-center justify-between md:h-auto">
          <Link href="/">
            <h1 className="text-2xl font-black italic uppercase tracking-tighter text-[var(--text)]">
              Mosk<span className="text-[#10b981]">Props</span>
            </h1>
          </Link>
          <button
            onClick={() => setIsOpen(false)}
            className="md:hidden p-1 text-[var(--text-muted)] hover:text-[var(--text)] bg-[var(--surface-soft)] rounded-md border border-[var(--border)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 pt-6 pb-2">
          <div className="flex bg-[var(--surface-soft)] p-1 rounded-xl border border-[var(--border)]">
            <Link
              href="/"
              className={`flex-1 flex items-center justify-center py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                !isLoLMode
                  ? 'bg-[#10b981] text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              NBA
            </Link>
            <Link
              href="/lol"
              className={`flex-1 flex items-center justify-center py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                isLoLMode
                  ? 'bg-[#10b981] text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              Esports
            </Link>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto hide-scrollbar">
          <p className="px-4 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-4 mt-2">
            Menú {isLoLMode ? 'Esports' : 'Principal'}
          </p>

          {activeItems.map((item) => {
            let isActive = false;
            if (item.path === '/' && pathname === '/') isActive = true;
            else if (item.path === '/lol' && pathname === '/lol') isActive = true;
            else if (item.path !== '/' && item.path !== '/lol' && pathname.startsWith(item.path)) isActive = true;

            return (
              <Link
                key={item.name}
                href={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all group border ${
                  isActive
                    ? 'bg-[var(--brand-soft)] text-[#10b981] border-[#10b981]/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)] border-transparent'
                }`}
              >
                <div className={`${isActive ? 'text-[#10b981]' : 'text-[var(--text-muted)] group-hover:text-[#10b981]'} transition-colors`}>
                  {item.icon}
                </div>
                <span className="font-bold text-xs uppercase tracking-widest">
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-[var(--border)] space-y-3">
          <ThemeToggle />

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--surface-soft)] border border-[var(--border)] flex items-center justify-center">
              <span className="text-[10px] font-black text-[#10b981]">PRO</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">Acceso Privado</p>
              <p className="text-[9px] font-bold text-[var(--text-muted)]">v1.0.0 Alpha</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
