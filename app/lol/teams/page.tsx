import { PrismaClient } from '@prisma/client';
import TeamsClient from './TeamsClient';

const prisma = new PrismaClient();

async function getTeamsByLeague() {
  const matches = await prisma.matches_lol.findMany();
  const leagues: Record<string, Record<string, any>> = {};

  matches.forEach((m) => {
    if (!leagues[m.league]) leagues[m.league] = {};
    if (!leagues[m.league][m.team_name]) {
      leagues[m.league][m.team_name] = {
        name: m.team_name,
        pj: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        totalGoldDiff: 0,
        validMacro: 0
      };
    }
    const t = leagues[m.league][m.team_name];
    t.pj += 1;
    if (m.win) t.wins += 1;
    t.kills += m.team_kills || 0;
    t.deaths += m.team_deaths || 0;
    if (m.gold_diff_at_15 !== null) {
      t.totalGoldDiff += m.gold_diff_at_15;
      t.validMacro += 1;
    }
  });

  const sortedLeagues: { name: string, teams: any[] }[] = [];
  const tier1 = ['LCK', 'LPL', 'LEC', 'LCS'];

  Object.keys(leagues).forEach(leagueName => {
    const teamsArray = Object.values(leagues[leagueName])
      .sort((a: any, b: any) => (b.wins / b.pj) - (a.wins / a.pj));
    sortedLeagues.push({ name: leagueName, teams: teamsArray });
  });

  sortedLeagues.sort((a, b) => {
    const aIndex = tier1.indexOf(a.name);
    const bIndex = tier1.indexOf(b.name);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  return sortedLeagues;
}

export default async function TeamsDirectoryPage() {
  const leaguesData = await getTeamsByLeague();
  
  // Le pasamos la data procesada al componente interactivo
  return <TeamsClient leaguesData={leaguesData} />;
}