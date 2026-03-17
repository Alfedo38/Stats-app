import Link from 'next/link';
import { PrismaClient } from '@prisma/client';
import { ChevronLeft, Crosshair, ShieldAlert, Activity, Swords, Flame, Target } from 'lucide-react';

const prisma = new PrismaClient();

async function getTeamData(league: string, teamParam: string, season: string) {
  const teamNameDecoded = decodeURIComponent(teamParam);

  // 1. Partidos del equipo
  const matches = await prisma.matches_lol.findMany({
    where: {
      league: { equals: league, mode: 'insensitive' },
      team_name: { equals: teamNameDecoded, mode: 'insensitive' },
      season: season
    },
    orderBy: { date: 'desc' }
  });

  if (matches.length === 0) return null;

  // 2. Buscamos a los rivales (CORRECCIÓN DEL BUG DE CLONES)
  const gameIds = matches.map(m => m.game_id);
  const opponents = await prisma.matches_lol.findMany({
    where: { 
      game_id: { in: gameIds }, 
      NOT: { team_name: { equals: teamNameDecoded, mode: 'insensitive' } }
    },
    select: { game_id: true, team_name: true, dragons: true }
  });

  const opponentsMap: Record<string, any> = {};
  opponents.forEach(opp => { opponentsMap[opp.game_id] = opp; });

  // 3. Traemos a los JUGADORES de este equipo en estas partidas
  const playersData = await prisma.player_stats_lol.findMany({
    where: { game_id: { in: gameIds }, team_name: { equals: teamNameDecoded, mode: 'insensitive' } }
  });

  // Agrupar Stats de Jugadores
  const rosterStats: Record<string, any> = {};
  playersData.forEach(p => {
    if (!rosterStats[p.player_name]) {
      rosterStats[p.player_name] = {
        name: p.player_name, position: p.position, games: 0, kills: 0, deaths: 0, assists: 0, 
        fbKills: 0, fbVictim: 0, champs: {}
      };
    }
    const player = rosterStats[p.player_name];
    player.games += 1;
    player.kills += p.kills;
    player.deaths += p.deaths;
    player.assists += p.assists;
    if (p.first_blood_kill) player.fbKills += 1;
    if (p.first_blood_victim) player.fbVictim += 1;
    
    player.champs[p.champion] = (player.champs[p.champion] || 0) + 1;
  });

  // Calcular Totales del Equipo y Mercado Over/Under
  let over45DragonsCount = 0;
  
  const totals = matches.reduce((acc, m) => {
    acc.kills += m.team_kills;
    acc.deaths += m.team_deaths;
    acc.wins += m.win ? 1 : 0;
    acc.towers += m.towers || 0;
    
    // Calcular Dragones Totales de la Partida
    const oppDragons = opponentsMap[m.game_id]?.dragons || 0;
    const totalMatchDragons = (m.dragons || 0) + oppDragons;
    if (totalMatchDragons > 4.5) over45DragonsCount += 1;

    return acc;
  }, { kills: 0, deaths: 0, wins: 0, games: matches.length, towers: 0 });

  return { 
    matches, teamName: matches[0].team_name, totals, opponentsMap, 
    roster: Object.values(rosterStats),
    over45DragonsRate: ((over45DragonsCount / matches.length) * 100).toFixed(1)
  };
}

export default async function TeamPage({ params, searchParams }: { params: Promise<{ league: string, team: string }>, searchParams: Promise<{ season?: string }> }) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const currentSeason = resolvedSearchParams.season || '2026';
  
  const data = await getTeamData(resolvedParams.league, resolvedParams.team, currentSeason);

  if (!data) {
    return (
      <div className="min-h-screen bg-black text-white p-8 flex flex-col items-center justify-center">
        <h1 className="text-3xl font-black italic uppercase">Sin registros</h1>
        <Link href={`/lol/${resolvedParams.league.toLowerCase()}`} className="mt-4 text-[#10b981] hover:underline">Volver</Link>
      </div>
    );
  }

  const { matches, teamName, totals, opponentsMap, roster, over45DragonsRate } = data;

  // Ordenar roster por posición (Top, Jng, Mid, Bot, Sup)
  const posOrder: Record<string, number> = { top: 1, jng: 2, mid: 3, bot: 4, sup: 5 };
  roster.sort((a, b) => (posOrder[a.position] || 9) - (posOrder[b.position] || 9));

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <Link href={`/lol/${resolvedParams.league.toLowerCase()}?season=${currentSeason}`} className="text-[#666] hover:text-white transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest w-fit">
          <ChevronLeft size={14} /> Volver a {resolvedParams.league.toUpperCase()}
        </Link>

        {/* HEADER DEL EQUIPO */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-[#1a1a1a] pb-8">
          <div>
            <h1 className="text-6xl font-black italic uppercase tracking-tighter text-white">{teamName}</h1>
            <p className="text-[#10b981] text-[12px] font-black uppercase tracking-[0.4em] mt-2">
              Temporada {currentSeason} • {totals.wins}W - {totals.games - totals.wins}L
            </p>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto">
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-4 min-w-[120px]">
              <div className="flex items-center gap-2 text-orange-500 mb-1">
                <Flame size={14} /> <span className="text-[10px] font-black uppercase tracking-widest">+4.5 Dragones</span>
              </div>
              <span className="text-3xl font-black">{over45DragonsRate}%</span>
            </div>
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-4 min-w-[120px]">
              <div className="flex items-center gap-2 text-blue-500 mb-1">
                <Target size={14} /> <span className="text-[10px] font-black uppercase tracking-widest">Torres / Partida</span>
              </div>
              <span className="text-3xl font-black">{(totals.towers / totals.games).toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* ROSTER DE JUGADORES (AHORA CLICKEABLES) */}
        <div>
           <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#444] flex items-center gap-2 mb-6">
             <Swords size={16} className="text-[#10b981]" /> Player Props & Roster Activo
           </h2>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {roster.map(player => {
                const bestChamp = Object.keys(player.champs).reduce((a, b) => player.champs[a] > player.champs[b] ? a : b, "");
                
                return (
                  <Link 
                    key={player.name} 
                    href={`/lol/players/${encodeURIComponent(player.name.toLowerCase())}`} 
                    className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-5 hover:border-[#333] transition-all block group"
                  >
                    <p className="text-[9px] font-black uppercase tracking-widest text-[#666] mb-1">{player.position}</p>
                    <h3 className="text-xl font-black italic uppercase tracking-tighter text-gray-300 group-hover:text-white transition-colors mb-4 truncate">{player.name}</h3>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-[#666] uppercase">KDA</span>
                        <span className="text-xs font-black text-gray-300">
                          {((player.kills + player.assists) / Math.max(1, player.deaths)).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-[#666] uppercase">First Blood %</span>
                        <span className="text-xs font-black text-green-400">{((player.fbKills / player.games) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between items-center pt-3 border-t border-[#1a1a1a]">
                        <span className="text-[10px] font-bold text-[#666] uppercase">Main Pick</span>
                        <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{bestChamp}</span>
                      </div>
                    </div>
                  </Link>
                )
              })}
           </div>
        </div>

        {/* Historial Partida a Partida */}
        <div>
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#444] flex items-center gap-2 mb-6 mt-8">
            <Activity size={16} className="text-blue-500" /> Historial Partida a Partida
          </h2>
          <div className="grid gap-3">
            {matches.map((match) => {
              const isWin = match.win;
              const opponent = opponentsMap[match.game_id]?.team_name || 'Rival Desconocido';
              const matchDragons = (match.dragons || 0) + (opponentsMap[match.game_id]?.dragons || 0);

              return (
                <div key={match.id} className={`relative overflow-hidden rounded-xl p-4 flex flex-col md:flex-row items-center justify-between border transition-colors ${isWin ? 'bg-[#10b981]/5 border-[#10b981]/20 hover:border-[#10b981]/50' : 'bg-red-500/5 border-red-500/20 hover:border-red-500/50'}`}>
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isWin ? 'bg-[#10b981]' : 'bg-red-500'}`} />
                  
                  <div className="flex items-center gap-6 w-full md:w-1/3 pl-2">
                    <div>
                      <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isWin ? 'text-[#10b981]' : 'text-red-500'}`}>
                        {isWin ? 'VICTORIA' : 'DERROTA'} • {match.date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                      <div className="flex items-center gap-2 text-white font-black italic text-xl uppercase tracking-tighter">
                        <span>VS</span><span className="text-gray-300">{opponent}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-4 w-full md:w-1/3 my-4 md:my-0">
                    <span className="text-2xl font-black text-white">{match.team_kills}</span>
                    <Swords size={16} className="text-[#444]" />
                    <span className="text-2xl font-black text-gray-500">{match.team_deaths}</span>
                  </div>

                  <div className="w-full md:w-1/3 text-right">
                    <p className="text-sm font-black text-white mb-1">
                       <span className={matchDragons > 4.5 ? 'text-orange-500' : 'text-gray-400'}>
                         {matchDragons} Dragones Totales
                       </span>
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#666]">
                      {match.towers || 0} Torres Destruidas
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </main>
  );
}