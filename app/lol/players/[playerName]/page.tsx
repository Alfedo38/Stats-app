import Link from 'next/link';
import { PrismaClient } from '@prisma/client';
import { ChevronLeft, Crosshair, Target, Activity, Swords, TrendingUp } from 'lucide-react';

const prisma = new PrismaClient();

async function getPlayerStats(playerName: string) {
  const decodedName = decodeURIComponent(playerName);

  // 1. Buscamos todas las partidas que jugó este jugador
  const playerGames = await prisma.player_stats_lol.findMany({
    where: { player_name: { equals: decodedName, mode: 'insensitive' } },
  });

  if (playerGames.length === 0) return null;

  // 2. Necesitamos cruzar con la tabla de equipos para saber si GANÓ o PERDIÓ
  const gameIds = playerGames.map(p => p.game_id);
  const teamMatches = await prisma.matches_lol.findMany({
    where: { game_id: { in: gameIds } },
    orderBy: { date: 'desc' }
  });

  const matchMap: Record<string, any> = {};
  teamMatches.forEach(m => {
    matchMap[`${m.game_id}_${m.team_name}`] = m;
  });

  // CORRECCIÓN: Extraemos la liga del jugador de sus partidos recientes
  const league = teamMatches.length > 0 ? teamMatches[0].league : 'lol';

  // 3. Procesamos las métricas
  const champPool: Record<string, any> = {};
  let totalKills = 0, totalDeaths = 0, totalAssists = 0;
  let totalDmgShare = 0, totalCSPM = 0, totalVision = 0;
  let wins = 0;
  let validAdvancedStatsGames = 0;

  const recentGames = [];

  for (const pg of playerGames) {
    const matchInfo = matchMap[`${pg.game_id}_${pg.team_name}`];
    if (!matchInfo) continue;

    const isWin = matchInfo.win;
    if (isWin) wins++;

    totalKills += pg.kills;
    totalDeaths += pg.deaths;
    totalAssists += pg.assists;

    if (pg.damage_share) {
      totalDmgShare += pg.damage_share;
      totalCSPM += pg.cs_per_min || 0;
      totalVision += pg.vision_score || 0;
      validAdvancedStatsGames++;
    }

    if (!champPool[pg.champion]) {
      champPool[pg.champion] = {
        name: pg.champion, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, fbKills: 0
      };
    }
    const champ = champPool[pg.champion];
    champ.games++;
    if (isWin) champ.wins++;
    champ.kills += pg.kills;
    champ.deaths += pg.deaths;
    champ.assists += pg.assists;
    if (pg.first_blood_kill) champ.fbKills++;

    recentGames.push({
      id: pg.id,
      date: matchInfo.date,
      champion: pg.champion,
      kills: pg.kills,
      deaths: pg.deaths,
      assists: pg.assists,
      win: isWin,
      team: pg.team_name,
      cspm: pg.cs_per_min,
    });
  }

  recentGames.sort((a, b) => b.date.getTime() - a.date.getTime());

  const champsArray = Object.values(champPool)
    .map(c => ({
      ...c,
      winRate: ((c.wins / c.games) * 100).toFixed(1),
      kda: ((c.kills + c.assists) / Math.max(1, c.deaths)).toFixed(2),
      fbRate: ((c.fbKills / c.games) * 100).toFixed(1)
    }))
    .sort((a, b) => b.games - a.games);

  return {
    name: decodedName,
    team: playerGames[0].team_name,
    league: league, // Mandamos la liga a la UI para armar el link de volver
    position: playerGames[0].position,
    games: playerGames.length,
    wins,
    winRate: ((wins / playerGames.length) * 100).toFixed(1),
    kda: ((totalKills + totalAssists) / Math.max(1, totalDeaths)).toFixed(2),
    avgDmgShare: validAdvancedStatsGames ? ((totalDmgShare / validAdvancedStatsGames) * 100).toFixed(1) : 'N/A',
    avgCSPM: validAdvancedStatsGames ? (totalCSPM / validAdvancedStatsGames).toFixed(1) : 'N/A',
    avgVision: validAdvancedStatsGames ? Math.round(totalVision / validAdvancedStatsGames) : 'N/A',
    champPool: champsArray,
    recentGames: recentGames.slice(0, 10)
  };
}

export default async function PlayerPage({ params }: { params: Promise<{ playerName: string }> }) {
  const resolvedParams = await params;
  const stats = await getPlayerStats(resolvedParams.playerName);

  if (!stats) {
    return (
      <div className="min-h-screen bg-black text-white p-8 flex flex-col items-center justify-center">
        <h1 className="text-3xl font-black italic uppercase">Jugador no encontrado</h1>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* CORRECCIÓN: Un link server-side de Next.js 100% puro */}
        <Link href={`/lol/${stats.league.toLowerCase()}/${encodeURIComponent(stats.team.toLowerCase())}`} className="text-[#666] hover:text-white transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest w-fit">
          <ChevronLeft size={14} /> Volver a {stats.team}
        </Link>

        {/* HEADER DEL JUGADOR */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-[#1a1a1a] pb-8">
          <div>
            <h1 className="text-6xl font-black italic uppercase tracking-tighter text-white">
              {stats.name}
            </h1>
            <p className="text-[#10b981] text-[12px] font-black uppercase tracking-[0.4em] mt-2">
              {stats.team} • {stats.position} • {stats.winRate}% WIN RATE
            </p>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto">
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-4 min-w-[120px]">
              <div className="flex items-center gap-2 text-blue-400 mb-1">
                <Crosshair size={14} /> <span className="text-[10px] font-black uppercase tracking-widest">KDA Global</span>
              </div>
              <span className="text-3xl font-black">{stats.kda}</span>
            </div>
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-4 min-w-[120px]">
              <div className="flex items-center gap-2 text-orange-500 mb-1">
                <TrendingUp size={14} /> <span className="text-[10px] font-black uppercase tracking-widest">% Daño Equipo</span>
              </div>
              <span className="text-3xl font-black">{stats.avgDmgShare}%</span>
            </div>
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-4 min-w-[120px]">
              <div className="flex items-center gap-2 text-green-400 mb-1">
                <Target size={14} /> <span className="text-[10px] font-black uppercase tracking-widest">CS/Minuto</span>
              </div>
              <span className="text-3xl font-black">{stats.avgCSPM}</span>
            </div>
          </div>
        </div>

        {/* CHAMPION POOL (Tabla) */}
        <div>
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#444] flex items-center gap-2 mb-6">
            <Swords size={16} className="text-[#10b981]" /> Champion Pool & Mastery
          </h2>
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1a1a1a] bg-[#111]">
                    <th className="p-4 pl-6 text-[10px] font-black uppercase tracking-widest text-[#666]">Campeón</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-[#666] text-center">Partidos</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-[#10b981] text-center">Win Rate</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-blue-400 text-center">KDA</th>
                    <th className="p-4 pr-6 text-[10px] font-black uppercase tracking-widest text-red-500 text-center">First Blood %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a1a1a]">
                  {stats.champPool.map((champ) => (
                    <tr key={champ.name} className="hover:bg-[#111] transition-colors">
                      <td className="p-4 pl-6 font-black uppercase tracking-tight text-white">{champ.name}</td>
                      <td className="p-4 text-center text-gray-400 font-medium">{champ.games}</td>
                      <td className="p-4 text-center text-lg font-black text-white">{champ.winRate}%</td>
                      <td className="p-4 text-center text-gray-300 font-bold">{champ.kda}</td>
                      <td className="p-4 pr-6 text-center text-gray-300 font-bold">{champ.fbRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* HISTORIAL RECIENTE (Form Check) */}
        <div>
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#444] flex items-center gap-2 mb-6 mt-8">
            <Activity size={16} className="text-blue-500" /> Form Check (Últimos 10 Partidos)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {stats.recentGames.map((game, i) => (
              <div key={i} className={`border rounded-xl p-4 flex flex-col justify-between h-28 ${game.win ? 'bg-[#10b981]/5 border-[#10b981]/20' : 'bg-red-500/5 border-red-500/20'}`}>
                <div className="flex justify-between items-start">
                  <span className="font-black italic text-white uppercase">{game.champion}</span>
                  <span className={`text-[9px] font-black uppercase tracking-widest ${game.win ? 'text-[#10b981]' : 'text-red-500'}`}>
                    {game.win ? 'WIN' : 'LOSS'}
                  </span>
                </div>
                <div className="flex justify-between items-end">
                  <div className="font-black text-lg tracking-tighter">
                    <span className="text-green-400">{game.kills}</span><span className="text-[#444] text-sm">/</span>
                    <span className="text-red-500">{game.deaths}</span><span className="text-[#444] text-sm">/</span>
                    <span className="text-gray-400">{game.assists}</span>
                  </div>
                  <span className="text-[10px] font-bold text-[#666]">{game.cspm ? game.cspm.toFixed(1) : 'N/A'} CS/M</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}