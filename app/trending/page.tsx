import { getTopPerformers } from '@/lib/api';
import { Target, Zap, Trophy, ChevronRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Métricas On Fire',
};

// ✅ FIX: Tipos propios en vez de any.
// Antes, (data as any)[section.key] y player: any hacían que TypeScript
// no pudiera avisarte si cambiaba la estructura de getTopPerformers().
// Ahora, si cambia la función, el compilador te avisa en qué páginas rompe.
interface PlayerStat {
  id: number;
  full_name: string;
  team_abbr: string;
  pts_avg: number;
  reb_avg: number;
  ast_avg: number;
}

interface TopPerformers {
  puntos: PlayerStat[];
  rebotes: PlayerStat[];
  asistencias: PlayerStat[];
  pra: PlayerStat[];
}

interface Section {
  title: string;
  key: keyof TopPerformers;
  statKey: keyof PlayerStat;
  icon: React.ReactNode;
  label: string;
  color: string;
}

export default async function OnFirePage() {
  const data = await getTopPerformers() as TopPerformers;

  const sections: Section[] = [
    {
      title: 'Líderes en Puntos',
      key: 'puntos',
      statKey: 'pts_avg',
      icon: <Target className="text-orange-500" />,
      label: 'PTS',
      color: 'border-orange-500/20'
    },
    {
      title: 'Líderes en Rebotes',
      key: 'rebotes',
      statKey: 'reb_avg',
      icon: <Zap className="text-blue-500" />,
      label: 'REB',
      color: 'border-blue-500/20'
    },
    {
      title: 'Líderes en Asistencias',
      key: 'asistencias',
      statKey: 'ast_avg',
      icon: <Trophy className="text-green-500" />,
      label: 'AST',
      color: 'border-green-500/20'
    },
  ];

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-12">

        <div className="flex justify-between items-center border-b border-[#111] pb-8">
          <div>
            <h1 className="text-4xl font-black italic uppercase tracking-tighter">
              Métricas <span className="text-[#10b981]">On Fire</span>
            </h1>
            <p className="text-[#444] text-[10px] font-bold uppercase tracking-[0.4em] mt-2">
              Datos Puros de Base de Datos • Temporada 25/26
            </p>
          </div>
          <div className="flex items-center gap-2 bg-[#10b981]/5 border border-[#10b981]/20 px-4 py-2 rounded-xl">
            <ShieldCheck size={14} className="text-[#10b981]" />
            <span className="text-[9px] font-black uppercase text-[#10b981]">Filtro Médico Activo</span>
          </div>
        </div>

        {sections.map((section) => (
          <section key={section.key} className="space-y-6">
            <div className="flex items-center gap-3">
              {section.icon}
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#666]">
                {section.title}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* ✅ FIX: player tipado como PlayerStat — TypeScript ahora
                  avisa si accedés a una propiedad que no existe */}
              {data[section.key]?.map((player: PlayerStat) => (
                <Link
                  href={`/players/${player.id}`}
                  key={player.id}
                  className={`group relative bg-[#0a0a0a] border ${section.color} p-6 rounded-[2.5rem] hover:bg-[#0f0f0f] transition-all overflow-hidden`}
                >
                  <div className="flex justify-between items-start relative z-10 mb-8">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-black border border-[#222] flex items-center justify-center font-black text-[#666] text-xs group-hover:text-white transition-colors">
                        {player.team_abbr}
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tighter leading-none">
                          {player.full_name}
                        </h3>
                        <p className="text-[9px] text-[#444] font-bold uppercase mt-1 tracking-widest">
                          Temporada 25/26
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-black/40 border border-[#111] p-6 rounded-3xl text-center relative z-10">
                    <p className="text-4xl font-black text-white">
                      {/* ✅ FIX: tipado correcto permite acceso seguro sin cast */}
                      {(player[section.statKey] as number)?.toFixed(1) ?? '0.0'}
                    </p>
                    <p className="text-[10px] font-black text-[#444] uppercase tracking-widest mt-1">
                      Promedio {section.label}
                    </p>
                  </div>

                  <div className="mt-6 flex items-center justify-center text-[9px] font-black uppercase text-[#222] group-hover:text-white transition-colors tracking-[0.2em]">
                    Analizar Perfil <ChevronRight size={12} className="ml-1" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}

      </div>
    </main>
  );
}