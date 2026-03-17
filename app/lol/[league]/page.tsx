import Link from 'next/link';
import { PrismaClient } from '@prisma/client';
import { ChevronLeft, Trophy, Calendar } from 'lucide-react';

const prisma = new PrismaClient();
export const revalidate = 3600;

async function getLeagueStats(leagueName: string, season: string) {
  const matches = await prisma.matches_lol.findMany({
    where: { 
      league: { equals: leagueName, mode: 'insensitive' },
      season: season // Agregamos el filtro por temporada
    },
    select: {
      team_name: true, win: true, first_blood: true, first_tower: true, first_dragon: true,
      team_kills: true, team_deaths: true
    }
  });

  if (matches.length === 0) return null;

  const teamStats: Record<string, any> = {};

  matches.forEach(m => {
    if (!teamStats[m.team_name]) {
      teamStats[m.team_name] = {
        name: m.team_name, totalGames: 0, wins: 0, firstBloods: 0, firstTowers: 0, firstDragons: 0,
        totalKills: 0, totalDeaths: 0
      };
    }
    
    teamStats[m.team_name].totalGames += 1;
    teamStats[m.team_name].totalKills += m.team_kills;
    teamStats[m.team_name].totalDeaths += m.team_deaths;
    if (m.win) teamStats[m.team_name].wins += 1;
    if (m.first_blood) teamStats[m.team_name].firstBloods += 1;
    if (m.first_tower) teamStats[m.team_name].firstTowers += 1;
    if (m.first_dragon) teamStats[m.team_name].firstDragons += 1;
  });

  return Object.values(teamStats)
    .map(team => ({
      ...team,
      winRate: ((team.wins / team.totalGames) * 100).toFixed(1),
      fbRate: ((team.firstBloods / team.totalGames) * 100).toFixed(1),
      ftRate: ((team.firstTowers / team.totalGames) * 100).toFixed(1),
      fdRate: ((team.firstDragons / team.totalGames) * 100).toFixed(1),
      avgKills: (team.totalKills / team.totalGames).toFixed(1),
      avgDeaths: (team.totalDeaths / team.totalGames).toFixed(1),
    }))
    .sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate));
}

// En Next.js 15, params y searchParams son Promesas
export default async function LeaguePage({ 
  params, 
  searchParams 
}: { 
  params: Promise<{ league: string }>,
  searchParams: Promise<{ season?: string }>
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  
  const leagueName = resolvedParams.league.toUpperCase();
  const currentSeason = resolvedSearchParams.season || '2026'; // Por defecto muestra el año actual
  
  const stats = await getLeagueStats(leagueName, currentSeason);
  const availableSeasons = ['2026', '2025', '2024'];

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Navegación y Header */}
        <div className="flex flex-col gap-4">
          <Link href="/lol" className="text-[#666] hover:text-white transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest w-fit">
            <ChevronLeft size={14} /> Volver a Ligas
          </Link>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-[#1a1a1a] rounded-2xl flex items-center justify-center border border-[#333]">
                <Trophy className="text-[#10b981]" size={32} />
              </div>
              <div>
                <h1 className="text-5xl font-black italic uppercase tracking-tighter">{leagueName}</h1>
                <p className="text-[#444] text-[10px] font-bold uppercase tracking-[0.4em] mt-1">
                  Estadísticas Globales • {currentSeason}
                </p>
              </div>
            </div>

            {/* Selector de Temporadas */}
            <div className="flex gap-2 bg-[#0a0a0a] p-1.5 rounded-xl border border-[#1a1a1a]">
              {availableSeasons.map(season => (
                <Link 
                  key={season} 
                  href={`/lol/${leagueName.toLowerCase()}?season=${season}`}
                  className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                    currentSeason === season 
                      ? 'bg-[#10b981] text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
                      : 'text-[#666] hover:text-white hover:bg-[#111]'
                  }`}
                >
                  {season}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Tabla de Estadísticas */}
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1a1a1a] bg-[#111]">
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-[#666]">Equipo</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-[#666] text-center">PJ</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-[#10b981] text-center">Win Rate</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-green-400 text-center">Kills/Map</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-red-500 text-center">Deaths/Map</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-blue-500 text-center">1st Tower %</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-orange-500 text-center">1st Dragon %</th>
                </tr>
              </thead>
              {stats && (
                <tbody className="divide-y divide-[#1a1a1a]">
                  {stats.map((team, index) => (
                    <tr key={team.name} className="hover:bg-[#111] transition-colors group">
                      <td className="p-6">
                        <div className="flex items-center gap-3">
                          <span className="text-[#444] font-black text-xs w-4">{index + 1}.</span>
                          <Link 
                            href={`/lol/${leagueName.toLowerCase()}/${encodeURIComponent(team.name.toLowerCase())}?season=${currentSeason}`}
                            className="font-black uppercase tracking-tight text-gray-200 group-hover:text-white group-hover:underline"
                          >
                            {team.name}
                          </Link>
                        </div>
                      </td>
                      <td className="p-6 text-center text-gray-400 font-medium">{team.totalGames}</td>
                      <td className="p-6 text-center text-lg font-black text-white">{team.winRate}%</td>
                      <td className="p-6 text-center text-green-400 font-bold">{team.avgKills}</td>
                      <td className="p-6 text-center text-red-500 font-bold">{team.avgDeaths}</td>
                      <td className="p-6 text-center text-gray-300 font-bold">{team.ftRate}%</td>
                      <td className="p-6 text-center text-gray-300 font-bold">{team.fdRate}%</td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
            {!stats && (
              <div className="p-12 text-center text-[#666] font-bold uppercase tracking-widest">
                No hay datos para la temporada {currentSeason}
              </div>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}