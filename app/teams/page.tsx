import Link from 'next/link';
import { Shield, ChevronRight } from 'lucide-react';

export default function TeamsDirectoryPage() {
  const NBA_TEAMS = [
    { id: 'ATL', name: 'Atlanta Hawks', color: 'hover:border-red-500', glow: 'group-hover:text-red-500' }, 
    { id: 'BOS', name: 'Boston Celtics', color: 'hover:border-green-500', glow: 'group-hover:text-green-500' },
    { id: 'BKN', name: 'Brooklyn Nets', color: 'hover:border-gray-400', glow: 'group-hover:text-gray-400' }, 
    { id: 'CHA', name: 'Charlotte Hornets', color: 'hover:border-teal-400', glow: 'group-hover:text-teal-400' },
    { id: 'CHI', name: 'Chicago Bulls', color: 'hover:border-red-600', glow: 'group-hover:text-red-600' }, 
    { id: 'CLE', name: 'Cleveland Cavaliers', color: 'hover:border-[#860038]', glow: 'group-hover:text-[#860038]' },
    { id: 'DAL', name: 'Dallas Mavericks', color: 'hover:border-blue-500', glow: 'group-hover:text-blue-500' }, 
    { id: 'DEN', name: 'Denver Nuggets', color: 'hover:border-yellow-500', glow: 'group-hover:text-yellow-500' },
    { id: 'DET', name: 'Detroit Pistons', color: 'hover:border-blue-600', glow: 'group-hover:text-blue-600' }, 
    { id: 'GSW', name: 'Golden State Warriors', color: 'hover:border-yellow-400', glow: 'group-hover:text-yellow-400' },
    { id: 'HOU', name: 'Houston Rockets', color: 'hover:border-red-500', glow: 'group-hover:text-red-500' }, 
    { id: 'IND', name: 'Indiana Pacers', color: 'hover:border-yellow-500', glow: 'group-hover:text-yellow-500' },
    { id: 'LAC', name: 'LA Clippers', color: 'hover:border-blue-500', glow: 'group-hover:text-blue-500' }, 
    { id: 'LAL', name: 'Los Angeles Lakers', color: 'hover:border-purple-500', glow: 'group-hover:text-purple-500' },
    { id: 'MEM', name: 'Memphis Grizzlies', color: 'hover:border-blue-300', glow: 'group-hover:text-blue-300' }, 
    { id: 'MIA', name: 'Miami Heat', color: 'hover:border-red-500', glow: 'group-hover:text-red-500' },
    { id: 'MIL', name: 'Milwaukee Bucks', color: 'hover:border-green-600', glow: 'group-hover:text-green-600' }, 
    { id: 'MIN', name: 'Minnesota Timberwolves', color: 'hover:border-blue-400', glow: 'group-hover:text-blue-400' },
    { id: 'NOP', name: 'New Orleans Pelicans', color: 'hover:border-[#85714D]', glow: 'group-hover:text-[#85714D]' }, 
    { id: 'NYK', name: 'New York Knicks', color: 'hover:border-orange-500', glow: 'group-hover:text-orange-500' },
    { id: 'OKC', name: 'Oklahoma City Thunder', color: 'hover:border-blue-400', glow: 'group-hover:text-blue-400' }, 
    { id: 'ORL', name: 'Orlando Magic', color: 'hover:border-blue-500', glow: 'group-hover:text-blue-500' },
    { id: 'PHI', name: 'Philadelphia 76ers', color: 'hover:border-blue-600', glow: 'group-hover:text-blue-600' }, 
    { id: 'PHX', name: 'Phoenix Suns', color: 'hover:border-orange-500', glow: 'group-hover:text-orange-500' },
    { id: 'POR', name: 'Portland Trail Blazers', color: 'hover:border-red-600', glow: 'group-hover:text-red-600' }, 
    { id: 'SAC', name: 'Sacramento Kings', color: 'hover:border-purple-600', glow: 'group-hover:text-purple-600' },
    { id: 'SAS', name: 'San Antonio Spurs', color: 'hover:border-gray-400', glow: 'group-hover:text-gray-400' }, 
    { id: 'TOR', name: 'Toronto Raptors', color: 'hover:border-red-500', glow: 'group-hover:text-red-500' },
    { id: 'UTA', name: 'Utah Jazz', color: 'hover:border-yellow-500', glow: 'group-hover:text-yellow-500' }, 
    { id: 'WAS', name: 'Washington Wizards', color: 'hover:border-blue-700', glow: 'group-hover:text-blue-700' }
  ];

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Cabecera */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[#222] pb-6">
          <div>
            <h1 className="text-4xl font-black italic uppercase tracking-tighter flex items-center gap-3">
              Franquicias <Shield className="text-[#10b981]" size={32} />
            </h1>
            <p className="text-[#666] text-xs font-bold uppercase tracking-widest mt-1">
              Seleccioná un equipo para ver su plantel analítico
            </p>
          </div>
        </div>

        {/* Grilla de Equipos (Modo Quant - Cero Imágenes) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {NBA_TEAMS.map((team) => (
            <Link 
              key={team.id} 
              href={`/teams/${team.id}`}
              className={`bg-[#0a0a0a] border border-[#1a1a1a] p-4 rounded-3xl flex flex-col items-center justify-center gap-4 transition-all duration-300 group ${team.color} hover:bg-[#111] hover:-translate-y-1 hover:shadow-2xl hover:shadow-black`}
            >
              
              {/* El Escudo CSS Minimalista */}
              <div className="w-16 h-16 rounded-full border-2 border-[#222] bg-black flex items-center justify-center group-hover:border-[#333] transition-colors relative overflow-hidden">
                {/* Brillo de fondo al pasar el mouse */}
                <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity bg-current ${team.glow}`} />
                
                {/* La sigla del equipo (Ej: LAL) */}
                <span className={`font-black text-2xl tracking-tighter text-[#555] transition-colors duration-300 ${team.glow}`}>
                  {team.id}
                </span>
              </div>

              {/* Textos */}
              <div className="text-center">
                <h2 className="text-white font-black text-[11px] uppercase tracking-tighter">{team.name}</h2>
                <p className="text-[#444] text-[9px] font-bold uppercase tracking-widest mt-1 group-hover:text-white transition-colors flex items-center justify-center">
                  Ver Data <ChevronRight size={10} className="ml-1 group-hover:translate-x-1 transition-transform" />
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}