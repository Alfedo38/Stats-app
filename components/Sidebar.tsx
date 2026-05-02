"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Zap, Users, Flame, MessageSquare, Stethoscope, Trophy, Shield, Cpu, Globe, Menu, X } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Truco UX: Cerrar el menú automáticamente cuando el usuario hace clic en un enlace en el celular
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
      {/* 📱 TOP BAR EXCLUSIVO PARA CELULARES */}
      <div className="md:hidden fixed top-0 left-0 w-full h-16 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-[#1a1a1a] flex items-center justify-between px-4 z-[150]">
        <Link href="/">
          <h1 className="text-xl font-black italic uppercase tracking-tighter text-white">
            Mosk<span className="text-[#10b981]">Props</span>
          </h1>
        </Link>
        <button 
          onClick={() => setIsOpen(true)}
          className="p-2 text-[#666] hover:text-[#10b981] transition-colors bg-[#111] rounded-lg border border-[#222]"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* 🌑 FONDO OSCURO (OVERLAY) PARA CUANDO EL MENÚ ESTÁ ABIERTO EN CELULAR */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[190] md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* 🖥️ SIDEBAR (PC) + 📱 SLIDE MENU (CELULAR) */}
      <aside className={`fixed top-0 left-0 h-screen w-64 bg-[#0a0a0a] border-r border-[#1a1a1a] flex flex-col z-[200] transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } md:translate-x-0`}>
        
        {/* Cabecera del Menú */}
        <div className="p-6 h-16 border-b border-[#1a1a1a] flex items-center justify-between md:h-auto">
          <Link href="/">
            <h1 className="text-2xl font-black italic uppercase tracking-tighter text-white">
              Mosk<span className="text-[#10b981]">Props</span>
            </h1>
          </Link>
          <button 
            onClick={() => setIsOpen(false)}
            className="md:hidden p-1 text-[#666] hover:text-white bg-[#111] rounded-md border border-[#222]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Selector de Mundo (NBA vs LoL) */}
        <div className="px-4 pt-6 pb-2">
          <div className="flex bg-[#111] p-1 rounded-xl border border-[#222]">
            <Link 
              href="/" 
              className={`flex-1 flex items-center justify-center py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                !isLoLMode 
                  ? 'bg-[#10b981] text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]' 
                  : 'text-[#666] hover:text-white hover:bg-[#1a1a1a]'
              }`}
            >
              NBA
            </Link>
            <Link 
              href="/lol" 
              className={`flex-1 flex items-center justify-center py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                isLoLMode 
                  ? 'bg-[#10b981] text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]' 
                  : 'text-[#666] hover:text-white hover:bg-[#1a1a1a]'
              }`}
            >
              Esports
            </Link>
          </div>
        </div>

        {/* Links de Navegación */}
        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto hide-scrollbar">
          <p className="px-4 text-[10px] font-black uppercase tracking-widest text-[#444] mb-4 mt-2">
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
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${
                  isActive 
                    ? 'bg-[#1a1a1a] text-[#10b981] shadow-[0_0_15px_rgba(16,185,129,0.05)] border border-[#333]' 
                    : 'text-[#666] hover:bg-[#111] hover:text-white border border-transparent'
                }`}
              >
                <div className={`${isActive ? 'text-[#10b981]' : 'text-[#555] group-hover:text-[#888]'} transition-colors`}>
                  {item.icon}
                </div>
                <span className="font-bold text-xs uppercase tracking-widest">
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Footer Info */}
        <div className="p-6 border-t border-[#1a1a1a]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#111] border border-[#333] flex items-center justify-center">
              <span className="text-[10px] font-black text-[#10b981]">PRO</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white">Acceso Privado</p>
              <p className="text-[9px] font-bold text-[#555]">v1.0.0 Alpha</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}