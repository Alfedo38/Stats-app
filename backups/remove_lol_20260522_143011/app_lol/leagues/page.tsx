import { PrismaClient } from '@prisma/client';
import LeaguesClient from './LeaguesClient';

const prisma = new PrismaClient();

export default async function LeaguesPage() {
  // 1. Buscamos todas las ligas y equipos reales de tu base de datos
  const matches = await prisma.matches_lol.findMany({
    select: { league: true, team_name: true },
    distinct: ['league', 'team_name'],
    orderBy: [{ league: 'asc' }, { team_name: 'asc' }]
  });

  // 2. Agrupamos por liga: { "LCK": ["T1", "Gen.G"], "LPL": [...] }
  const leaguesData: Record<string, string[]> = {};
  matches.forEach((m) => {
    if (!leaguesData[m.league]) leaguesData[m.league] = [];
    leaguesData[m.league].push(m.team_name);
  });

  // 3. Pasamos los datos agrupados al componente visual
  return <LeaguesClient initialData={leaguesData} />;
}