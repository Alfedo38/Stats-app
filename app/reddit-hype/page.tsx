import { Flame, MessageSquare, TrendingUp, TrendingDown } from 'lucide-react';
import { getRedditTrends } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function RedditHypePage() {
  const trendingPlayers = await getRedditTrends();

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Cabecera */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black italic uppercase tracking-tighter flex items-center gap-3">
              Radar <span className="text-orange-500">Social</span> <Flame size={28} className="text-orange-500"/>
            </h1>
            <p className="text-[#666] text-[10px] font-bold uppercase tracking-widest mt-1">
              Escaneando r/sportsbook en tiempo real
            </p>
          </div>
          <div className="flex items-center gap-2 bg-[#111] border border-[#222] px-4 py-2 rounded-xl">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest text-orange-500">Live Tracker</span>
          </div>
        </div>

        {/* Banner Explicativo */}
        <div className="bg-[#111] border border-[#222] rounded-2xl p-5 flex items-start gap-4">
          <div className="bg-orange-500/20 p-3 rounded-xl shrink-0 mt-1">
            <MessageSquare size={20} className="text-orange-500" />
          </div>
          <div>
            <h3 className="text-white font-black uppercase text-sm mb-1">El Termómetro de la Comunidad</h3>
            <p className="text-[#888] text-xs leading-relaxed">
              El Radar analiza miles de comentarios en Reddit. Las tarjetas naranjas indican un 
              <strong className="text-orange-500"> Hype alto</strong> (tendencia fuerte). Las rojas son apuestas que la 
              comunidad está ignorando o esquivando hoy. Cuidado: seguir a la multitud no siempre garantiza ganar.
            </p>
          </div>
        </div>

        {trendingPlayers.length === 0 ? (
          <div className="bg-[#111] border border-[#222] p-8 rounded-3xl text-center">
             <p className="text-[#666] font-bold uppercase tracking-widest">El radar está en silencio. No hay tendencias detectadas aún.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {trendingPlayers.map((player: any) => {
              const isHot = player.trend === 'up';
              
              // Traductor automático al argentino puro
              let displaySentiment = player.sentiment;
              if (displaySentiment === "A GANAR (ML)") displaySentiment = "GANA DIRECTO (ML)";
              if (displaySentiment === "SPREAD / ML") displaySentiment = "SPREAD / ML"; // Por si quedó alguno viejo

              return (
                <div key={player.id} className={`bg-[#0a0a0a] border p-6 rounded-3xl relative overflow-hidden transition-all ${isHot ? 'border-[#1a1a1a] hover:border-orange-500/50' : 'border-[#1a1a1a] hover:border-red-500/30'}`}>
                  
                  {/* Resplandor de fondo (Naranja si es caliente, Rojo suave si es frío) */}
                  <div className={`absolute top-0 right-0 w-32 h-32 opacity-5 blur-[50px] rounded-full pointer-events-none ${isHot ? 'bg-orange-500' : 'bg-red-500'}`} />

                  <div className="flex justify-between items-start mb-6 relative z-10">
                    <div className="flex gap-4 items-center">
                      <div className={`w-12 h-12 rounded-full border flex items-center justify-center shrink-0 bg-[#111] ${isHot ? 'border-[#333] shadow-[0_0_15px_rgba(249,115,22,0.15)]' : 'border-red-900/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]'}`}>
                        <span className={`font-black text-xl ${isHot ? 'text-orange-500' : 'text-red-500'}`}>
                          {player.player_name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <h2 className="text-xl font-black uppercase tracking-tighter text-white">
                          {player.player_name}
                        </h2>
                        <p className="text-[10px] text-[#666] font-black uppercase tracking-widest">{player.team_abbr}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-3xl font-black ${isHot ? 'text-orange-500' : 'text-red-500'}`}>
                        {player.hype_score}
                      </span>
                      <span className="text-xs font-black text-[#555]"> / 100</span>
                      <p className="text-[8px] uppercase tracking-widest text-[#444] font-bold">Hype Score</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between relative z-10 bg-[#111] p-4 rounded-2xl border border-[#222]">
                    <div>
                      <p className="text-[9px] text-[#666] font-black uppercase tracking-widest mb-1">Consenso Público</p>
                      <p className={`text-sm font-black uppercase flex items-center gap-2 ${isHot ? 'text-[#10b981]' : 'text-red-500'}`}>
                        {displaySentiment} {isHot ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-[#666] font-black uppercase tracking-widest mb-1">Menciones</p>
                      <p className="text-sm font-black text-white">{player.mentions} 💬</p>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>
    </main>
  );
}