"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
// 1. Agregamos Stethoscope al import
import { Home, Zap, Users, Flame, MessageSquare, Stethoscope } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();

  // 2. Lo sumamos a la lista oficial para que herede todo el diseño
  const navItems = [
    { name: 'Dashboard', path: '/', icon: <Home size={18} /> },
    { name: 'Cerebro EV+', path: '/ev-plays', icon: <Zap size={18} /> },
    { name: 'Equipos', path: '/teams', icon: <Users size={18} /> },
    { name: 'Radar Social', path: '/reddit-hype', icon: <MessageSquare size={18} /> },
    { name: 'Parte Médico', path: '/injuries', icon: <Stethoscope size={18} /> }, // 👈 Nuevo!
    { name: 'On Fire', path: '/trending', icon: <Flame size={18} /> },
  ];

  return (
    <aside className="fixed top-0 left-0 h-screen w-64 bg-[#0a0a0a] border-r border-[#1a1a1a] hidden md:flex flex-col z-[200]">
      {/* Logo */}
      <div className="p-6 border-b border-[#1a1a1a]">
        <Link href="/">
          <h1 className="text-2xl font-black italic uppercase tracking-tighter text-white">
            Mosk<span className="text-[#10b981]">Props</span>
          </h1>
        </Link>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-8 space-y-2">
        <p className="px-4 text-[10px] font-black uppercase tracking-widest text-[#444] mb-4">
          Menú Principal
        </p>
        
        {navItems.map((item) => {
          const isActive = pathname === item.path;
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
  );
}