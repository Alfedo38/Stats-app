import Link from 'next/link';
import { Users, Star, ChevronRight } from 'lucide-react';

export default function PlayersHub() {
  // Jugadores Franquicia (Los más buscados para Player Props)
  const iconicPlayers = [
    { name: 'Faker', team: 'T1', role: 'MID', league: 'LCK', color: 'text-blue-500' },
    { name: 'Chovy', team: 'Gen.G', role: 'MID', league: 'LCK', color: 'text-blue-500' },
    { name: 'Viper', team: 'Hanwha Life Esports', role: 'BOT', league: 'LCK', color: 'text-blue-500' },
    { name: 'Knight', team: 'Bilibili Gaming', role: 'MID', league: 'LPL', color: 'text-red-500' },
    { name: 'Ruler', team: 'JD Gaming', role: 'BOT', league: 'LPL', color: 'text-red-500' },
    { name: 'JackeyLove', team: 'Top Esports', role: 'BOT', league: 'LPL', color: 'text-red-500' },
    { name: 'Caps', team: 'G2 Esports', role: 'MID', league: 'LEC', color: 'text-orange-500' },
    { name: 'Humanoid', team: 'Fnatic', role: 'MID', league: 'LEC', color: 'text-orange-500' },
    { name: 'nuc', team: 'Team BDS', role: 'MID', league: 'LEC', color: 'text-orange-500' },
    { name: 'CoreJJ', team: 'Team Liquid', role: 'SUP', league: 'LCS', color: 'text-indigo-500' },
    { name: 'Inspired', team: 'FlyQuest', role: 'JNG', league: 'LCS', color: 'text-indigo-500' },
    { name: 'Blaber', team: 'Cloud9', role: 'JNG', league: 'LCS', color: 'text-indigo-500' },
  ];

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-10">
        
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-[#1a1a1a] pb-6">
          <div className="w-16 h-16 bg-[#1a1a1a] rounded-2xl flex items-center justify-center border border-[#333]">
            <Users className="text-[#10b981]" size={32} />
          </div>
          <div>
            <h1 className="text-5xl font-black italic uppercase tracking-tighter">Jugadores Franquicia</h1>
            <p className="text-[#444] text-[10px] font-bold uppercase tracking-[0.4em] mt-1">
              Estrellas Tier 1 • Player Props
            </p>
          </div>
        </div>

        {/* Grilla de Jugadores */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {iconicPlayers.map((player) => (
            <Link
              key={player.name}
              href={`/lol/players/${encodeURIComponent(player.name.toLowerCase())}`}
              className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-5 hover:border-[#333] transition-all group relative overflow-hidden"
            >
              {/* Brillo sutil de fondo según región */}
              <div className={`absolute -right-4 -top-4 w-24 h-24 ${player.color} opacity-5 blur-2xl rounded-full`} />
              
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#666] mb-1">
                    {player.league} • {player.role}
                  </p>
                  <h2 className="text-2xl font-black italic uppercase tracking-tighter text-gray-200 group-hover:text-white">
                    {player.name}
                  </h2>
                </div>
                <Star size={16} className={`${player.color} opacity-70`} />
              </div>

              <div className="flex items-center justify-between border-t border-[#1a1a1a] pt-4 mt-2 relative z-10">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{player.team}</span>
                <span className="flex items-center text-[10px] font-black text-[#10b981] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                  Ver Stats <ChevronRight size={14} className="ml-1" />
                </span>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </main>
  );
}