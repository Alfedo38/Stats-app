import { getTeamPlayers } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';

export default async function TeamRosterPage({ params }: { params: { teamId: string } }) {
  const teamId = params.teamId;
  const players = await getTeamPlayers(teamId);

  return (
    <main className="min-h-screen bg-black text-white font-sans pb-20">
      <nav className="border-b border-[#222] bg-black sticky top-0 z-50">
        <div className="px-6 py-4 max-w-6xl mx-auto flex items-center gap-4">
          <Link href="/" className="text-[#888] hover:text-[#10b981] transition-colors"><ArrowLeft size={20} /></Link>
          <h1 className="text-2xl font-black italic tracking-tighter uppercase">Mosk<span className="text-[#10b981]">Props</span></h1>
        </div>
      </nav>

      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
        <div className="flex items-center gap-6 bg-[#111] border border-[#222] rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <img src={`https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${teamId.toLowerCase()}.png`} className="w-24 h-24 object-contain" />
          <div className="z-10">
            <p className="text-[#10b981] font-bold text-[10px] uppercase tracking-[0.3em]">Official Roster</p>
            <h1 className="text-5xl font-black uppercase tracking-tighter">{teamId}</h1>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {players.map((p: any) => (
            <Link href={`/players/${p.id}`} key={p.id} className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-4 hover:border-[#10b981] transition-all flex flex-col items-center">
              <img src={`https://cdn.nba.com/headshots/nba/latest/260x190/${p.id}.png`} className="h-24 object-contain" />
              <p className="font-black text-center mt-2 uppercase text-xs">{p.full_name}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}