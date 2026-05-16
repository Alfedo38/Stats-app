// app/injuries/page.tsx
import { PrismaClient } from '@prisma/client';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Injury Report | MoskProps',
};

const prisma = new PrismaClient();

const ARG_TZ = 'America/Argentina/Buenos_Aires';

function getTodayArg(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARG_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

async function getInjuriesFromDB() {
  const todayStr = getTodayArg();

  const rows = await prisma.nba_injuries.findMany({
    where: { fetch_date: todayStr },
    orderBy: { team_name: 'asc' },
  });

  // Agrupar por equipo
  const teamsMap = new Map<string, any>();
  for (const row of rows) {
    if (!teamsMap.has(row.team_id)) {
      teamsMap.set(row.team_id, {
        id:          row.team_id,
        displayName: row.team_name,
        logo:        row.team_logo,
        injuries:    [],
      });
    }
    teamsMap.get(row.team_id).injuries.push({
      athlete: { id: row.player_id, shortName: row.player_name },
      status:  row.status,
      comment: row.comment,
    });
  }

  return Array.from(teamsMap.values());
}

export default async function InjuriesPage() {
  const realTeams = await getInjuriesFromDB();

  // 🧪 Datos de prueba solo en desarrollo
  const fakeTeams = [
    {
      id: "fake-1",
      displayName: "Los Angeles Lakers",
      logo: "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/lal.png",
      injuries: [
        { athlete: { id: "p1", shortName: "LeBron James" },   status: "Questionable", comment: "Ankle Soreness" },
        { athlete: { id: "p2", shortName: "Anthony Davis" },  status: "Probable",     comment: "Eye" },
        { athlete: { id: "p3", shortName: "Cam Reddish" },    status: "Out",          comment: "Ankle" },
      ],
    },
    {
      id: "fake-2",
      displayName: "Golden State Warriors",
      logo: "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/gs.png",
      injuries: [
        { athlete: { id: "p4", shortName: "Stephen Curry" },   status: "Out",      comment: "Ankle Sprain" },
        { athlete: { id: "p5", shortName: "Draymond Green" },  status: "Doubtful", comment: "Back" },
      ],
    },
  ];

  const teams = process.env.NODE_ENV === 'development' && realTeams.length === 0
    ? fakeTeams
    : realTeams;

  const statusColumns = ['Probable', 'Questionable', 'Doubtful', 'Out'];

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] p-4 md:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-[var(--text-muted)] hover:text-[#10b981] transition-colors">
              <ChevronLeft size={24} />
            </Link>
            <h1 className="text-3xl font-black italic uppercase tracking-tighter flex items-center gap-3">
              Injury <span className="text-red-500">Report</span> 🚑
            </h1>
          </div>
          <div className="hidden md:flex gap-2">
            <span className="text-[9px] font-black uppercase text-red-500 bg-red-500/10 px-3 py-1 rounded-md border border-red-500/20 animate-pulse">
              Live Updates
            </span>
          </div>
        </div>

        {/* Tabla */}
        {teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border border-dashed border-[var(--border)] rounded-3xl">
            <p className="text-[var(--text-muted)] font-black uppercase tracking-widest text-sm">
              Sin lesionados reportados hoy
            </p>
            <p className="text-[var(--text-soft)] text-[10px] font-bold uppercase tracking-widest mt-2">
              El sync del día aún no corrió o la NBA no publicó el reporte
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-[var(--surface-soft)] border-b border-[var(--border)]">
                    <th className="p-5 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] w-56">Equipo</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-green-500  bg-green-500/5  text-center border-x border-[var(--border)]">Probable</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-yellow-500 bg-yellow-500/5 text-center">Questionable</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-orange-500 bg-orange-500/5 text-center border-x border-[var(--border)]">Doubtful</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-red-600    bg-red-600/5    text-center">OUT</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team: any) => (
                    <tr key={team.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors group">
                      <td className="p-5 border-r border-[var(--border)] bg-[var(--surface)]">
                        <div className="flex items-center gap-3">
                          <img src={team.logo} className="w-7 h-7 object-contain drop-shadow-lg" alt="" />
                          <span className="font-black uppercase text-xs tracking-tighter group-hover:text-[#10b981] transition-colors">
                            {team.displayName}
                          </span>
                        </div>
                      </td>

                      {statusColumns.map((col) => {
                        const playersInCol = team.injuries.filter((i: any) =>
                          i.status.toLowerCase().includes(col.toLowerCase())
                        );
                        return (
                          <td key={col} className="p-3 text-center border-r border-[var(--border)] last:border-0 align-top">
                            <div className="flex flex-col gap-2">
                              {playersInCol.length === 0 ? (
                                <span className="text-[var(--text-soft)] text-[10px]">—</span>
                              ) : (
                                playersInCol.map((injury: any) => (
                                  <div key={injury.athlete.id} className="group/item relative py-1 px-2 rounded-lg hover:bg-[var(--surface-hover)] transition-all">
                                    <span className="text-[10px] font-bold text-[var(--text)] group-hover/item:text-[#10b981] cursor-default">
                                      {injury.athlete.shortName}
                                    </span>
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 hidden group-hover/item:block bg-[var(--surface)] border border-[var(--border-strong)] p-2 rounded-xl text-[9px] z-50 shadow-[0_10px_30px_rgba(0,0,0,0.18)] text-[var(--text)] text-center leading-relaxed">
                                      <p className="font-black uppercase text-red-500 mb-1">{injury.status}</p>
                                      {injury.comment || "No detail"}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}