import Link from 'next/link';
import { getTeams, getTrendingPlayers, getEvPlays } from '@/lib/api'; 
import { Calendar, Users, Flame, TrendingUp, Target, Zap } from 'lucide-react';
import SearchBar from '@/components/SearchBar';
import TeamGrid from '@/components/TeamGrid';
import LiveGamesCarousel from '@/components/LiveGamesCarousel';

// Seguro de vida: Siempre en vivo, sin caché
export const dynamic = 'force-dynamic';

async function getLiveGames() {
  try {
    const today = new Date();
    today.setHours(today.getHours() - 4); 
    
    const yyyy1 = today.getFullYear();
    const mm1 = String(today.getMonth() + 1).padStart(2, '0');
    const dd1 = String(today.getDate()).padStart(2, '0');
    const dateToday = `${yyyy1}${mm1}${dd1}`; 

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const yyyy2 = tomorrow.getFullYear();
    const mm2 = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd2 = String(tomorrow.getDate()).padStart(2, '0');
    const dateTomorrow = `${yyyy2}${mm2}${dd2}`;

    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateToday}-${dateTomorrow}`;
    
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    
    if (!data.events) return [];
    
    return data.events.map((event: any) => {
      const comp = event.competitions[0];
      const home = comp.competitors.find((c: any) => c.homeAway === 'home');
      const away = comp.competitors.find((c: any) => c.homeAway === 'away');

      const tv = comp.broadcasts && comp.broadcasts.length > 0 ? comp.broadcasts[0].names[0] : '';
      const odds = comp.odds && comp.odds.length > 0 ? comp.odds[0] : null;

      const gameDate = new Date(event.date);
      const dayName = gameDate.toLocaleDateString('en-US', { weekday: 'short' });

      return {
        id: event.id,
        status: event.status.type.state, 
        detail: event.status.type.state === 'pre' ? `${dayName} - ${event.status.type.shortDetail}` : event.status.type.shortDetail, 
        tv: tv, 
        odds: odds ? `${odds.details || ''} ${odds.overUnder ? '| O/U: ' + odds.overUnder : ''}` : '',
        home: { 
            abbr: home.team.abbreviation || 'TBD', 
            logo: home.team.logo, 
            score: event.status.type.state !== 'pre' ? home.score : '',
            record: home.records && home.records.length > 0 ? home.records[0].summary : '' 
        },
        away: { 
            abbr: away.team.abbreviation || 'TBD', 
            logo: away.team.logo, 
            score: event.status.type.state !== 'pre' ? away.score : '',
            record: away.records && away.records.length > 0 ? away.records[0].summary : ''
        }
      };
    });
  } catch (error) {
    return [];
  }
}

export default async function Home() {
  const teams = await getTeams();
  const liveGames = await getLiveGames();
  const trendingPlayers = await getTrendingPlayers();
  const evPlays = await getEvPlays(); // <-- LLAMAMOS AL CEREBRO EV+

  return (
    <main className="min-h-screen bg-black text-white font-sans pb-20 selection:bg-[#10b981]/30">
      
      <nav className="border-b border-[#111] bg-black/90 backdrop-blur-md sticky top-0 z-50">
        <div className="px-6 py-4 max-w-6xl mx-auto">
          <h1 className="text-2xl font-black italic tracking-tighter uppercase flex items-center gap-1">
            Mosk<span className="text-[#10b981]">Props</span>
          </h1>
        </div>
      </nav>

      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-10">
        
        {/* BUSCADOR */}
        <section className="px-2">
           <SearchBar />
        </section>

      {/* ESCÁNER EV+ (LA NUEVA MAGIA) */}
        {evPlays && evPlays.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Zap size={16} className="text-[#10b981] animate-pulse" />
              <h2 className="text-[#10b981] font-bold text-[11px] uppercase tracking-[0.3em] flex items-center gap-2">
                Top Value Plays <span className="bg-[#10b981]/20 text-[#10b981] px-2 py-0.5 rounded text-[8px]">EV+</span>
              </h2>
            </div>

            {/* CARRUSEL DESLIZABLE (Eliminamos el grid y usamos flex con overflow) */}
            <div className="flex overflow-x-auto gap-4 pb-4 px-1 no-scrollbar snap-x">
              {evPlays.map((play: any, idx: number) => {
                const edgeValue = play.avg_last_10 - play.line;
                const edge = edgeValue.toFixed(1);
                
                // LÓGICA DEL STICKER: Si el Edge es de 3.0 o más, es una bomba
                const isBang = edgeValue >= 3.0;
                
                return (
                  <Link href={`/players/${play.player_id}`} key={`ev-${idx}`} className="block no-underline group shrink-0 snap-start">
                    {/* FIJAMOS LA ALTURA Y EL ANCHO PARA QUE SEAN TODAS IGUALES */}
                    <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-[1.5rem] p-5 hover:bg-[#111] hover:border-[#10b981]/40 transition-all flex flex-col justify-between relative overflow-hidden shadow-xl w-[280px] h-[180px]">
                      
                      {/* Brillo de fondo */}
                      <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#10b981] opacity-5 blur-2xl group-hover:opacity-20 transition-opacity" />
                      
                      {/* STICKER "BANG!" (Aparece solo si isBang es true) */}
                      {isBang && (
                        <div className="absolute -left-6 top-3 bg-red-500 text-white text-[10px] font-black uppercase tracking-widest py-1 px-8 transform -rotate-45 shadow-[0_0_15px_rgba(239,68,68,0.6)] z-20 animate-pulse">
                          BANG! 💥
                        </div>
                      )}

                      {/* Cabecera Tarjeta */}
                      <div className="flex justify-between items-start z-10 relative border-b border-[#222] pb-3 mb-3">
                        <div className="flex-1 pr-2">
                          <span className="text-[#666] font-black text-[9px] uppercase tracking-[0.2em] truncate block w-full">{play.team} • {play.matchup}</span>
                          <h3 className="font-black text-white text-sm leading-tight uppercase mt-1 drop-shadow-md line-clamp-2">
                            {play.player_name}
                          </h3>
                        </div>
                        {/* El Tag Verde de "OVER" */}
                        <div className="bg-[#10b981] text-black px-2 py-1 rounded-md border border-[#059669] flex flex-col items-center leading-none transform rotate-3 group-hover:rotate-0 transition-transform shrink-0">
                          <span className="font-black text-[10px] uppercase">OVER</span>
                          <span className="font-black text-sm tabular-nums">{play.line}</span>
                        </div>
                      </div>

                      {/* Datos Matemáticos (Alineados al fondo) */}
                      <div className="z-10 relative flex justify-between items-end mt-auto">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-[9px] font-black text-[#888] uppercase tracking-wider">
                            <Target size={10} className="text-[#38bdf8]" />
                            <span>L10 AVG: <strong className="text-white text-xs tabular-nums">{play.avg_last_10}</strong></span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px] font-black text-[#888] uppercase tracking-wider">
                            <TrendingUp size={10} className="text-[#10b981]" />
                            <span>Edge: <strong className="text-[#10b981] text-xs">+{edge} pts</strong></span>
                          </div>
                        </div>

                        {/* Medidor de Hits */}
                        <div className="flex flex-col items-end">
                          <span className="text-[8px] text-[#666] font-black uppercase tracking-[0.2em] mb-1">Hit Rate</span>
                          <div className="flex items-end gap-1">
                            <span className="text-2xl font-black text-white leading-none tabular-nums">{play.over_hits}</span>
                            <span className="text-[#555] font-black text-sm leading-none mb-0.5">/10</span>
                          </div>
                        </div>
                      </div>

                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* JUGADORES EN RACHA (FUEGO) */}
        {trendingPlayers && trendingPlayers.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Flame size={14} className="text-orange-500" />
              <h2 className="text-orange-500 font-bold text-[10px] uppercase tracking-[0.3em]">
                Players on Fire (L5 PTS)
              </h2>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {trendingPlayers.map((player: any) => (
                <Link href={`/players/${player.id}`} key={player.id} className="block no-underline group">
                  <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-[1.5rem] p-5 hover:bg-[#111] hover:border-orange-500/40 transition-all flex flex-col justify-between relative overflow-hidden h-[130px] shadow-xl">
                    <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-orange-500 opacity-10 blur-2xl group-hover:opacity-20 transition-opacity" />
                    
                    <div className="flex justify-between items-start z-10 relative">
                      <div>
                        <span className="text-[#666] font-black text-[9px] uppercase tracking-[0.2em]">{player.team}</span>
                        <h3 className="font-black text-white text-sm leading-none uppercase mt-1 drop-shadow-md">
                          {player.first_name} <br/> <span className="text-orange-500">{player.last_name}</span>
                        </h3>
                      </div>
                      <div className="bg-black/50 backdrop-blur-sm px-2 py-1.5 rounded-lg border border-[#333] flex flex-col items-center leading-none">
                        <span className="text-orange-500 font-black tabular-nums text-sm">{player.avg_pts}</span>
                        <span className="text-[#555] text-[7px] font-black uppercase">AVG</span>
                      </div>
                    </div>

                    <img 
                      src={`https://cdn.nba.com/headshots/nba/latest/260x190/${player.id}.png`} 
                      alt={player.last_name}
                      className="absolute bottom-0 -right-2 w-28 h-28 object-contain object-bottom opacity-90 group-hover:scale-110 transition-transform duration-500"
                    />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* PARTIDOS */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-[#10b981]" />
              <h2 className="text-[#10b981] font-bold text-[10px] uppercase tracking-[0.3em]">
                Today's Slate
              </h2>
            </div>
          </div>
          <LiveGamesCarousel liveGames={liveGames} />
        </section>

        {/* EQUIPOS */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1 border-t border-[#111] pt-8">
            <Users size={14} className="text-[#666]" />
            <h2 className="text-[#666] font-bold text-[10px] uppercase tracking-[0.3em]">
              Select Team Roster
            </h2>
          </div>
          <TeamGrid teams={teams} />
        </section>

      </div>
    </main>
  );
}