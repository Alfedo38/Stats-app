import Link from 'next/link';
import { PrismaClient } from '@prisma/client';
import { ChevronLeft, Crosshair, Target, Activity, Swords, TrendingUp, ShieldCheck, Zap, Eye, Map as MapIcon, CalendarClock } from 'lucide-react';

const prisma = new PrismaClient();

async function getPlayerStats(playerName: string) {
  const decodedName = decodeURIComponent(playerName);
  const playerGames = await prisma.player_stats_lol.findMany({
    where: { player_name: { equals: decodedName, mode: 'insensitive' } },
  });
  
  if (playerGames.length === 0) return null;
  
  const gameIds = playerGames.map(p => p.game_id);
  const teamMatches = await prisma.matches_lol.findMany({
    where: { game_id: { in: gameIds } },
    orderBy: { date: 'desc' }
  });
  
  const matchMap: Record<string, any> = {};
  teamMatches.forEach(m => { matchMap[`${m.game_id}_${m.team_name}`] = m; });
  const league = teamMatches.length > 0 ? teamMatches[0].league : 'lol';

  const champPool: Record<string, any> = {};
  let totalKills = 0, totalDeaths = 0, totalAssists = 0;
  let totalDmgShare = 0, totalCSPM = 0, totalVision = 0, totalGoldShare = 0;
  let wins = 0;
  let validAdvancedStatsGames = 0;
  const recentGames = [];

  for (const pg of playerGames) {
    const matchInfo = matchMap[`${pg.game_id}_${pg.team_name}`];
    if (!matchInfo) continue;
    
    const isWin = matchInfo.win;
    if (isWin) wins++;
    
    totalKills += pg.kills; totalDeaths += pg.deaths; totalAssists += pg.assists;
    
    if (pg.damage_share) { 
      totalDmgShare += pg.damage_share; 
      totalCSPM += pg.cs_per_min || 0; 
      totalVision += pg.vision_score || 0;
      totalGoldShare += pg.gold_share || 0;
      validAdvancedStatsGames++; 
    }
    
    if (!champPool[pg.champion]) { 
      champPool[pg.champion] = { name: pg.champion, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, fbKills: 0 }; 
    }
    
    const champ = champPool[pg.champion];
    champ.games++; if (isWin) champ.wins++;
    champ.kills += pg.kills; champ.deaths += pg.deaths; champ.assists += pg.assists;
    if (pg.first_blood_kill) champ.fbKills++;

    recentGames.push({ 
      id: pg.id, 
      date: matchInfo.date, 
      champion: pg.champion, 
      kills: pg.kills, deaths: pg.deaths, assists: pg.assists, 
      win: isWin, 
      team: pg.team_name, 
      cspm: pg.cs_per_min,
      dmg: pg.damage_share
    });
  }

  recentGames.sort((a, b) => b.date.getTime() - a.date.getTime());
  
  const champsArray = Object.values(champPool).map((c:any) => ({
    ...c,
    winRate: ((c.wins / c.games) * 100).toFixed(1),
    kda: ((c.kills + c.assists) / Math.max(1, c.deaths)).toFixed(2),
    fbRate: ((c.fbKills / c.games) * 100).toFixed(1)
  })).sort((a, b) => b.games - a.games);

  return {
    name: decodedName, 
    team: playerGames[0].team_name, 
    league, 
    position: playerGames[0].position, 
    games: playerGames.length,
    wins, 
    winRate: ((wins / playerGames.length) * 100).toFixed(1),
    kda: ((totalKills + totalAssists) / Math.max(1, totalDeaths)).toFixed(2),
    avgKills: (totalKills / playerGames.length).toFixed(1),
    avgDeaths: (totalDeaths / playerGames.length).toFixed(1),
    avgAssists: (totalAssists / playerGames.length).toFixed(1),
    avgDmgShare: validAdvancedStatsGames ? ((totalDmgShare / validAdvancedStatsGames) * 100).toFixed(1) : '0',
    avgGoldShare: validAdvancedStatsGames ? ((totalGoldShare / validAdvancedStatsGames) * 100).toFixed(1) : '0',
    avgCSPM: validAdvancedStatsGames ? (totalCSPM / validAdvancedStatsGames).toFixed(1) : '0',
    avgVision: validAdvancedStatsGames ? Math.round(totalVision / validAdvancedStatsGames) : '0',
    champPool: champsArray, 
    recentGames: recentGames.slice(0, 15) // Mostramos 15 para igualar el largo de la página
  };
}

export default async function PlayerPage({ params }: { params: Promise<{ playerName: string }> }) {
  const resolvedParams = await params;
  const stats = await getPlayerStats(resolvedParams.playerName);

  if (!stats) return <div className="min-h-screen bg-black text-white flex items-center justify-center font-black uppercase tracking-widest text-2xl animate-pulse">Cargando Base de Datos...</div>;

  // Componente visual para barras de estilo de juego
  const StatBar = ({ label, value, max, colorClass }: { label: string, value: string | number, max: number, colorClass: string }) => {
    const numValue = parseFloat(value as string);
    const percentage = Math.min((numValue / max) * 100, 100);
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-[#666]">
          <span>{label}</span>
          <span className="text-white">{value}</span>
        </div>
        <div className="h-1.5 w-full bg-[#111] rounded-full overflow-hidden">
          <div className={`h-full ${colorClass}`} style={{ width: `${percentage}%` }} />
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20 relative overflow-hidden">
      {/* Luz ambiental (Mismo estilo que Equipos pero en Verde Jugador) */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#10b981]/5 blur-[150px] pointer-events-none" />

      <div className="max-w-[1400px] mx-auto space-y-10 relative z-10">
        
        {/* NAVEGACIÓN */}
        <Link href={`/lol/teams/${encodeURIComponent(stats.team)}`} className="group flex items-center gap-2 text-[#444] hover:text-[#10b981] transition-all text-[10px] font-black uppercase tracking-[0.3em] w-fit">
          <ChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> Ficha del Equipo ({stats.team})
        </Link>

        {/* HEADER DE IMPACTO */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-10 border-b border-[#1a1a1a] pb-10">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20 text-[10px] font-black px-3 py-1 rounded-md uppercase tracking-widest">
                {stats.position}
              </span>
              <span className="text-[#444] text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                <ShieldCheck size={12} /> {stats.league}
              </span>
            </div>
            <h1 className="text-7xl md:text-8xl font-black italic uppercase tracking-tighter leading-none">
              {stats.name}
            </h1>
            <div className="flex items-center gap-6 mt-4">
              <div className="text-[#444] font-black uppercase tracking-widest text-xs">
                Win Rate <span className="text-[#10b981] text-lg ml-2">{stats.winRate}%</span>
              </div>
              <div className="text-[#444] font-black uppercase tracking-widest text-xs">
                Mapas <span className="text-white text-lg ml-2">{stats.games}</span>
              </div>
            </div>
          </div>

          {/* TARJETAS SUPERIORES (Estilo Equipos) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full lg:w-auto">
            <div className="bg-gradient-to-br from-blue-900/10 to-[#0a0a0a] border border-[#1a1a1a] rounded-[2rem] p-6 shadow-xl min-w-[140px]">
              <div className="flex items-center gap-2 text-blue-500 mb-2"><Crosshair size={14} /> <span className="text-[9px] font-black uppercase tracking-widest">KDA Promedio</span></div>
              <p className="text-3xl font-black italic">{stats.kda}</p>
              <p className="text-[9px] font-bold text-[#666] uppercase mt-1">{stats.avgKills} / {stats.avgDeaths} / {stats.avgAssists}</p>
            </div>
            <div className="bg-gradient-to-br from-orange-900/10 to-[#0a0a0a] border border-[#1a1a1a] rounded-[2rem] p-6 shadow-xl min-w-[140px]">
              <div className="flex items-center gap-2 text-orange-500 mb-2"><TrendingUp size={14} /> <span className="text-[9px] font-black uppercase tracking-widest">Dmg Share</span></div>
              <p className="text-3xl font-black italic">{stats.avgDmgShare}%</p>
              <p className="text-[9px] font-bold text-[#666] uppercase mt-1">Daño del equipo</p>
            </div>
            <div className="bg-gradient-to-br from-yellow-900/10 to-[#0a0a0a] border border-[#1a1a1a] rounded-[2rem] p-6 shadow-xl min-w-[140px]">
              <div className="flex items-center gap-2 text-yellow-500 mb-2"><Zap size={14} /> <span className="text-[9px] font-black uppercase tracking-widest">Gold Share</span></div>
              <p className="text-3xl font-black italic">{stats.avgGoldShare}%</p>
              <p className="text-[9px] font-bold text-[#666] uppercase mt-1">Oro del equipo</p>
            </div>
            <div className="bg-gradient-to-br from-green-900/10 to-[#0a0a0a] border border-[#1a1a1a] rounded-[2rem] p-6 shadow-xl min-w-[140px]">
              <div className="flex items-center gap-2 text-green-500 mb-2"><Target size={14} /> <span className="text-[9px] font-black uppercase tracking-widest">CS / Min</span></div>
              <p className="text-3xl font-black italic">{stats.avgCSPM}</p>
              <p className="text-[9px] font-bold text-[#666] uppercase mt-1">Farmeo Promedio</p>
            </div>
          </div>
        </div>

        {/* LAYOUT DE 2 COLUMNAS (Igual que en Equipos) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          
          {/* COLUMNA IZQUIERDA: PERFIL Y MACRO */}
          <div className="xl:col-span-4 space-y-8">
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-[2.5rem] p-8 shadow-xl">
              <h2 className="text-[12px] font-black uppercase tracking-[0.3em] text-[#666] flex items-center gap-2 mb-8">
                <MapIcon size={18} className="text-[#10b981]" /> Perfil de Jugador
              </h2>
              <div className="space-y-6">
                {/* Barras relativas para ver estilo de juego (Max values son aproximados de un top tier) */}
                <StatBar label="Agresividad (Kills/Assists)" value={(parseFloat(stats.avgKills) + parseFloat(stats.avgAssists)).toFixed(1)} max={15} colorClass="bg-red-500" />
                <StatBar label="Supervivencia (Inverso a Deaths)" value={(10 - parseFloat(stats.avgDeaths)).toFixed(1)} max={10} colorClass="bg-blue-500" />
                <StatBar label="Eficiencia Farmeo (CS/M)" value={stats.avgCSPM} max={10.5} colorClass="bg-green-500" />
                <StatBar label="Presencia de Visión" value={stats.avgVision} max={100} colorClass="bg-purple-500" />
              </div>
            </div>

            {/* FORM CHECK VISUAL */}
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-[2.5rem] p-8 shadow-xl">
              <h2 className="text-[12px] font-black uppercase tracking-[0.3em] text-[#666] flex items-center gap-2 mb-6">
                <Activity size={18} className="text-blue-400" /> Racha Reciente
              </h2>
              <div className="flex flex-wrap gap-2">
                {stats.recentGames.slice(0, 10).map((game, i) => (
                  <div 
                    key={i} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border ${game.win ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/30' : 'bg-red-500/10 text-red-500 border-red-500/30'}`}
                    title={game.champion}
                  >
                    {game.win ? 'W' : 'L'}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* COLUMNA DERECHA: CHAMPION POOL Y TABLA DE PARTIDOS */}
          <div className="xl:col-span-8 space-y-8">
            
            {/* CHAMPION POOL ESTILO PRO */}
            <section>
              <h2 className="text-[12px] font-black uppercase tracking-[0.3em] text-[#666] flex items-center gap-2 mb-6 pl-2">
                <Swords size={18} className="text-[#10b981]" /> Champion Pool Histórico
              </h2>
              <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-[2.5rem] overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#0d0d0d] border-b border-[#1a1a1a]">
                        <th className="p-5 pl-8 text-[10px] font-black uppercase tracking-widest text-[#444]">Campeón</th>
                        <th className="p-5 text-center text-[10px] font-black uppercase tracking-widest text-[#444]">PJ</th>
                        <th className="p-5 text-center text-[10px] font-black uppercase tracking-widest text-[#10b981]">Win Rate</th>
                        <th className="p-5 text-center text-[10px] font-black uppercase tracking-widest text-blue-500">KDA</th>
                        <th className="p-5 pr-8 text-right text-[10px] font-black uppercase tracking-widest text-red-500">1st Blood %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1a1a1a]">
                      {stats.champPool.slice(0, 5).map((champ) => ( // Mostramos solo los 5 principales para no alargar
                        <tr key={champ.name} className="hover:bg-[#111] transition-colors group">
                          <td className="p-5 pl-8">
                            <div className="flex items-center gap-3">
                              <div className="w-1.5 h-6 bg-[#333] group-hover:bg-[#10b981] rounded-full transition-colors" />
                              <span className="font-black italic text-lg uppercase text-gray-200">{champ.name}</span>
                            </div>
                          </td>
                          <td className="p-5 text-center font-bold text-gray-500">{champ.games}</td>
                          <td className="p-5 text-center">
                            <span className="text-xl font-black italic text-white">{champ.winRate}%</span>
                          </td>
                          <td className="p-5 text-center font-bold text-blue-400/80">{champ.kda}</td>
                          <td className="p-5 pr-8 text-right font-bold text-red-500/80">{champ.fbRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* HISTORIAL DETALLADO */}
            <section>
              <h2 className="text-[12px] font-black uppercase tracking-[0.3em] text-[#666] flex items-center gap-2 mb-6 pl-2 mt-8">
                <CalendarClock size={18} className="text-white" /> Últimas Partidas
              </h2>
              <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-[2.5rem] overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#0d0d0d] border-b border-[#1a1a1a]">
                        <th className="p-5 pl-8 text-[10px] font-black uppercase tracking-widest text-[#444]">Pick</th>
                        <th className="p-5 text-center text-[10px] font-black uppercase tracking-widest text-[#444]">K / D / A</th>
                        <th className="p-5 text-center text-[10px] font-black uppercase tracking-widest text-[#444]">CS / Min</th>
                        <th className="p-5 text-center text-[10px] font-black uppercase tracking-widest text-[#444]">Dmg Share</th>
                        <th className="p-5 pr-8 text-right text-[10px] font-black uppercase tracking-widest text-[#444]">Resultado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1a1a1a]">
                      {stats.recentGames.map((game, idx) => (
                        <tr key={idx} className="hover:bg-[#111] transition-colors group">
                          <td className="p-5 pl-8 font-black italic uppercase text-gray-300">
                            {game.champion}
                          </td>
                          <td className="p-5 text-center font-black tracking-tighter text-lg">
                            <span className="text-[#10b981]">{game.kills}</span>
                            <span className="text-[#444] mx-1">-</span>
                            <span className="text-red-500">{game.deaths}</span>
                            <span className="text-[#444] mx-1">-</span>
                            <span className="text-gray-400">{game.assists}</span>
                          </td>
                          <td className="p-5 text-center font-bold text-gray-400">
                            {game.cspm ? game.cspm.toFixed(1) : '-'}
                          </td>
                          <td className="p-5 text-center font-bold text-gray-400">
                            {game.dmg ? (game.dmg * 100).toFixed(1) + '%' : '-'}
                          </td>
                          <td className="p-5 pr-8 text-right">
                            <span className={`inline-block px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${game.win ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                              {game.win ? 'Victoria' : 'Derrota'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

          </div>
        </div>

      </div>
    </main>
  );
}