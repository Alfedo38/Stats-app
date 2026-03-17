import Link from 'next/link';
import { Shield, Trophy, ChevronRight } from 'lucide-react';

export default function TeamsHub() {
  // Curaduría de los 3 mejores equipos por región principal (Igual a tu foto)
  const regions = [
    {
      name: 'LCK (Corea)',
      color: 'text-blue-500',
      borderColor: 'border-blue-500/30',
      bgHover: 'hover:bg-blue-500/5',
      teams: [
        { name: 'T1', league: 'lck' },
        { name: 'Gen.G', league: 'lck' },
        { name: 'Hanwha Life Esports', league: 'lck' },
      ]
    },
    {
      name: 'LPL (China)',
      color: 'text-red-500',
      borderColor: 'border-red-500/30',
      bgHover: 'hover:bg-red-500/5',
      teams: [
        { name: 'Bilibili Gaming', league: 'lpl' },
        { name: 'JD Gaming', league: 'lpl' },
        { name: 'Top Esports', league: 'lpl' },
      ]
    },
    {
      name: 'LEC (Europa)',
      color: 'text-orange-500',
      borderColor: 'border-orange-500/30',
      bgHover: 'hover:bg-orange-500/5',
      teams: [
        { name: 'G2 Esports', league: 'lec' },
        { name: 'Fnatic', league: 'lec' },
        { name: 'Team BDS', league: 'lec' },
      ]
    },
    {
      name: 'LCS (Norteamérica)',
      color: 'text-indigo-500',
      borderColor: 'border-indigo-500/30',
      bgHover: 'hover:bg-indigo-500/5',
      teams: [
        { name: 'Team Liquid', league: 'lcs' },
        { name: 'FlyQuest', league: 'lcs' },
        { name: 'Cloud9', league: 'lcs' },
      ]
    }
  ];

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-10">
        
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-[#1a1a1a] pb-6">
          <div className="w-16 h-16 bg-[#1a1a1a] rounded-2xl flex items-center justify-center border border-[#333] shadow-[0_0_20px_rgba(16,185,129,0.05)]">
            <Shield className="text-[#10b981]" size={32} />
          </div>
          <div>
            <h1 className="text-5xl font-black italic uppercase tracking-tighter">Equipos Tier 1</h1>
            <p className="text-[#444] text-[10px] font-bold uppercase tracking-[0.4em] mt-1">
              Top 3 por Región Principal
            </p>
          </div>
        </div>

        {/* Grilla por Regiones */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {regions.map((region) => (
            <div key={region.name} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-3xl p-6 relative overflow-hidden">
              {/* Brillo sutil de fondo según el color de la liga */}
              <div className={`absolute -right-10 -top-10 w-40 h-40 ${region.color} opacity-5 blur-3xl rounded-full pointer-events-none`} />
              
              <h2 className={`text-xl font-black uppercase tracking-tighter mb-6 flex items-center gap-2 ${region.color} relative z-10`}>
                <Trophy size={18} /> {region.name}
              </h2>
              
              <div className="space-y-3 relative z-10">
                {region.teams.map((team) => (
                  <Link
                    key={team.name}
                    href={`/lol/${team.league}/${encodeURIComponent(team.name.toLowerCase())}`}
                    className={`flex items-center justify-between p-4 rounded-xl border border-[#1a1a1a] transition-all group ${region.bgHover} hover:${region.borderColor}`}
                  >
                    <span className="font-black italic text-lg text-gray-300 group-hover:text-white uppercase tracking-tight">
                      {team.name}
                    </span>
                    <ChevronRight size={18} className="text-[#444] group-hover:text-white transition-colors" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

      </div>
    </main>
  );
}