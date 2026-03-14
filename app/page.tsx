import Link from 'next/link';
import { getTeams, getEvPlays } from '@/lib/api'; 
import prisma from '@/lib/prisma';
import { Calendar, Users, Flame, Zap } from 'lucide-react';
import SearchBar from '@/components/SearchBar';
import TeamGrid from '@/components/TeamGrid';
import LiveGamesCarousel from '@/components/LiveGamesCarousel';
import EVCarousel from '@/components/EVCarousel';

export const dynamic = 'force-dynamic';

async function getPlayersOnFire() {
  try {
    // 1. Ampliamos la muestra a 2500 para asegurarnos de capturar 
    // los últimos 5 partidos reales de todos los jugadores activos (aprox. 1 semana de NBA)
    const recentLogs = await prisma.player_game_logs.findMany({
      orderBy: { game_date: 'desc' },
      take: 2500, 
      select: {
        player_id: true,
        player_name: true,
        team_abbreviation: true,
        pts: true,
        game_date: true,
      }
    });

    // 2. Agrupamos por jugador
    const playerStats = new Map<number, any>();

    recentLogs.forEach(log => {
      if (!log.player_id) return;
      
      const playerId = log.player_id;
      if (!playerStats.has(playerId)) {
        playerStats.set(playerId, {
          id: playerId,
          name: log.player_name || 'Unknown',
          team: log.team_abbreviation || 'NBA',
          pointsList: [] as number[],
          uniqueDates: new Set<string>() // Evita duplicados del mismo día
        });
      }

      const playerInfo = playerStats.get(playerId);
      const dateString = log.game_date ? new Date(log.game_date).toISOString().split('T')[0] : null;

      // Solo guardamos si la fecha no está repetida y si aún no llegamos a 5 partidos
      if (dateString && !playerInfo.uniqueDates.has(dateString) && playerInfo.pointsList.length < 5) {
         playerInfo.uniqueDates.add(dateString);
         playerInfo.pointsList.push(Number(log.pts) || 0);
      }
    });

    // 3. Calculamos el promedio exacto
    return Array.from(playerStats.values())
      // Exigimos que SÍ O SÍ tengan al menos 3 partidos jugados en esta muestra para ser "On Fire"
      .filter(p => p.pointsList.length >= 3) 
      .map(p => {
        const totalPts = p.pointsList.reduce((sum: number, pts: number) => sum + pts, 0);
        const avg = totalPts / p.pointsList.length;
        
        const nameParts = p.name.split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ');

        return {
          id: p.id,
          first_name: firstName,
          last_name: lastName,
          team: p.team,
          avg_pts: avg.toFixed(1)
        };
      })
      .sort((a, b) => parseFloat(b.avg_pts) - parseFloat(a.avg_pts))
      .slice(0, 4);

  } catch (e) {
    console.error("Error en On Fire:", e);
    return [];
  }
}

async function getLiveGames() {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    return data.events?.map((event: any) => ({
      id: event.id,
      status: event.status.type.state, 
      detail: event.status.type.shortDetail, 
      home: { 
        abbr: event.competitions[0].competitors[0].team.abbreviation, 
        score: event.competitions[0].competitors[0].score, 
        logo: event.competitions[0].competitors[0].team.logo 
      },
      away: { 
        abbr: event.competitions[0].competitors[1].team.abbreviation, 
        score: event.competitions[0].competitors[1].score, 
        logo: event.competitions[0].competitors[1].team.logo 
      }
    })) || [];
  } catch (e) { 
    return []; 
  }
}

export default async function Home() {
  const [teams, liveGames, onFirePlayers, evPlays] = await Promise.all([
    getTeams(),
    getLiveGames(),
    getPlayersOnFire(),
    getEvPlays()
  ]);

  return (
    <main className="min-h-screen bg-black text-white pb-20">
      <nav className="border-b border-[#111] bg-black/90 sticky top-0 z-[100] px-6 py-4">
        <h1 className="text-2xl font-black italic uppercase max-w-6xl mx-auto">
          Mosk<span className="text-[#10b981]">Props</span>
        </h1>
      </nav>

      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-12">
        <section className="relative z-[120]">
          <SearchBar />
        </section>

        {evPlays && evPlays.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Zap size={16} className="text-[#10b981]" />
              <h2 className="text-[#10b981] font-bold text-[11px] uppercase tracking-[0.3em]">Top Value Plays</h2>
            </div>
            <EVCarousel evPlays={evPlays} />
          </section>
        )}

        {onFirePlayers && onFirePlayers.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Flame size={14} className="text-orange-500" />
              <h2 className="text-orange-500 font-bold text-[10px] uppercase tracking-[0.3em]">Players on Fire (L5 AVG)</h2>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {onFirePlayers.map((player: any) => (
                <Link href={`/players/${player.id}`} key={player.id} className="group relative bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-5 h-[130px] overflow-hidden hover:border-orange-500/50 transition-all">
                  <div className="z-10 relative">
                    <span className="text-[#444] font-black text-[9px] uppercase tracking-widest">{player.team}</span>
                    <h3 className="font-black text-white text-sm uppercase leading-none mt-1">
                      {player.first_name}<br/>
                      <span className="text-orange-500">{player.last_name}</span>
                    </h3>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-white font-black text-xl">{player.avg_pts}</span>
                      <span className="text-[#444] text-[8px] font-bold uppercase">PTS AVG</span>
                    </div>
                  </div>
                  <img 
                    src={`https://cdn.nba.com/headshots/nba/latest/260x190/${player.id}.png`} 
                    className="absolute bottom-0 -right-2 w-28 h-28 object-contain opacity-40 group-hover:opacity-100 transition-opacity" 
                    alt="" 
                  />
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Calendar size={14} className="text-[#10b981]" />
            <h2 className="text-[#10b981] font-bold text-[10px] uppercase tracking-[0.3em]">Today's Slate</h2>
          </div>
          <LiveGamesCarousel liveGames={liveGames} />
        </section>

        <section className="space-y-4 pt-4">
          <div className="flex items-center gap-2 px-1 opacity-50">
            <Users size={14} />
            <h2 className="font-bold text-[10px] uppercase tracking-[0.3em]">Team Rosters</h2>
          </div>
          <TeamGrid teams={teams} />
        </section>
      </div>
    </main>
  );
}