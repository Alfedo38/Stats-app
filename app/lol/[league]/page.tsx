import Link from 'next/link';
import { PrismaClient } from '@prisma/client';
import { Trophy, Activity, Target, ChevronRight, Swords } from 'lucide-react';

const prisma = new PrismaClient();
export const revalidate = 3600;

async function getLeagues() {
  const leagues = await prisma.matches_lol.findMany({
    distinct: ['league'],
    select: { league: true },
    orderBy: { league: 'asc' },
  });

  // Ligas mayores (Tier 1) para darles prioridad visual
  const majorLeagues = ['LCK', 'LPL', 'LEC', 'LCS', 'WLDs', 'MSI'];
  
  return leagues
    .map((l) => l.league)
    .sort((a, b) => {
      const aIsMajor = majorLeagues.includes(a);
      const bIsMajor = majorLeagues.includes(b);
      if (aIsMajor && !bIsMajor) return -1;
      if (!aIsMajor && bIsMajor) return 1;
      return 0;
    });
}

// Función auxiliar para darle un color a cada liga mayor
const getLeagueColor = (league: string) => {
  switch (league) {
    case 'LCK': return 'text-blue-500 border-blue-500/30 bg-blue-500/10 hover:border-blue-500'; // Corea: Azul
    case 'LPL': return 'text-red-500 border-red-500/30 bg-red-500/10 hover:border-red-500';   // China: Rojo
    case 'LEC': return 'text-orange-500 border-orange-500/30 bg-orange-500/10 hover:border-orange-500'; // Europa: Naranja
    case 'LCS': return 'text-indigo-500 border-indigo-500/30 bg-indigo-500/10 hover:border-indigo-500'; // NA: Indigo
    case 'WLDs': 
    case 'MSI': return 'text-yellow-500 border-yellow-500/50 bg-yellow-500/10 hover:border-yellow-500'; // Internacional: Dorado
    default: return 'text-gray-400 border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#10b981]/50'; // Resto
  }
};

export default async function LolDashboard() {
  const leagues = await getLeagues();
  
  // Separamos las ligas Tier 1 del resto para el diseño
  const majorLeaguesList = ['LCK', 'LPL', 'LEC', 'LCS', 'WLDs', 'MSI'];
  const majorLeagues = leagues.filter(l => majorLeaguesList.includes(l));
  const minorLeagues = leagues.filter(l => !majorLeaguesList.includes(l));

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-10">
        
        {/* Header (Estilo MoskProps) */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="text-4xl font-black italic uppercase tracking-tighter">
              League of <span className="text-[#10b981]">Legends</span>
            </h1>
            <p className="text-[#666] text-[10px] font-bold uppercase tracking-[0.4em] mt-1">
              MoskProps Analytics • Entorno Esports
            </p>
          </div>
        </header>

        {/* Banner Superior de Stats Generales */}
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-[2.5rem] p-8 relative overflow-hidden flex items-center justify-between">
           <div className="absolute top-0 left-0 w-64 h-64 bg-blue-600 opacity-5 blur-[100px] rounded-full pointer-events-none" />
           <div className="z-10">
              <h2 className="text-2xl font-black uppercase tracking-tighter mb-2 flex items-center gap-3">
                 <Swords className="text-blue-500" size={24}/>
                 Datos Puros de Competición
              </h2>
              <p className="text-[#444] text-[10px] font-medium uppercase tracking-widest max-w-lg">
                Modelos predictivos basados en diferencia de oro, control de objetivos tempranos y daño por minuto. Cero ruido social.
              </p>
           </div>
        </div>

        {/* Sección: Ligas Mayores (Tier 1) */}
        <div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#444] flex items-center gap-2 mb-6">
            <Trophy size={16} className="text-yellow-500" />
            Ligas Principales (Tier 1)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {majorLeagues.map((league) => (
              <Link 
                key={league} 
                href={`/lol/${league.toLowerCase()}`}
                className={`group block p-6 rounded-3xl transition-all relative overflow-hidden border ${getLeagueColor(league).split(' hover:')[0]} hover:${getLeagueColor(league).split(' hover:')[1]}`}
              >
                <div className="flex justify-between items-start mb-6">
                  <h2 className={`text-4xl font-black italic uppercase tracking-tighter ${getLeagueColor(league).split(' ')[0]}`}>
                    {league}
                  </h2>
                  <Activity size={20} className={`${getLeagueColor(league).split(' ')[0]} opacity-50`} />
                </div>
                
                <div className="flex items-center text-[10px] font-black uppercase tracking-widest mt-8 text-white group-hover:translate-x-2 transition-transform">
                  Analizar Equipos <ChevronRight size={14} className="ml-1" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Sección: Resto de Ligas */}
        <div className="pt-8 border-t border-[#111]">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#444] flex items-center gap-2 mb-6">
            <Target size={16} className="text-[#10b981]" />
            Circuito Global
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {minorLeagues.map((league) => (
              <Link 
                key={league} 
                href={`/lol/${league.toLowerCase()}`}
                className="group block bg-[#0a0a0a] border border-[#1a1a1a] p-4 rounded-2xl hover:border-[#10b981]/50 hover:bg-[#111] transition-all flex flex-col items-center justify-center text-center"
              >
                <h2 className="text-xl font-black text-gray-300 group-hover:text-white transition-colors">
                  {league}
                </h2>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}