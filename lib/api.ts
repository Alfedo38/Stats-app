import prisma from './prisma';

export async function getTeams() {
  try {
    // Usamos 'name' porque así está en tu base de datos de Supabase
    return await prisma.teams.findMany({
      orderBy: { name: 'asc' }
    });
  } catch (error) {
    console.error("Error en getTeams:", error);
    return [];
  }
}

export async function getTrendingPlayers() {
  try {
    const logs = await prisma.player_game_logs.findMany({
      take: 200,
      orderBy: { game_date: 'desc' }
    });
    
    // Lógica para agrupar y promediar los puntos
    const stats: any = {};
    logs.forEach(l => {
      if (!stats[l.player_id]) {
        stats[l.player_id] = { 
          id: l.player_id, 
          first_name: l.player_name?.split(' ')[0], 
          last_name: l.player_name?.split(' ').slice(1).join(' '),
          team: l.team_abbreviation, 
          total: 0, count: 0 
        };
      }
      if (stats[l.player_id].count < 5) {
        stats[l.player_id].total += (l.pts || 0);
        stats[l.player_id].count++;
      }
    });

    return Object.values(stats)
      .filter((p: any) => p.count === 5)
      .map((p: any) => ({ ...p, avg_pts: (p.total / 5).toFixed(1) }))
      .sort((a: any, b: any) => b.avg_pts - a.avg_pts)
      .slice(0, 4);
  } catch (error) {
    return [];
  }
}

export async function getEvPlays() {
  try {
    const odds = await prisma.player_odds.findMany();
    const logs = await prisma.player_game_logs.findMany({
      where: { player_name: { in: odds.map(o => o.player_name) } },
      orderBy: { game_date: 'desc' }
    });

    const plays = odds.map(odd => {
      const pLogs = logs.filter(l => l.player_name === odd.player_name).slice(0, 10);
      if (pLogs.length < 5) return null;
      const avg = pLogs.reduce((acc, curr) => acc + (curr.pts || 0), 0) / pLogs.length;
      const hits = pLogs.filter(l => (l.pts || 0) > odd.line).length;
      
      if (avg > odd.line && hits >= 6) {
        return {
          player_id: pLogs[0].player_id,
          player_name: odd.player_name,
          team: pLogs[0].team_abbreviation,
          matchup: odd.matchup,
          line: odd.line,
          avg_last_10: avg.toFixed(1),
          over_hits: hits
        };
      }
      return null;
    }).filter(Boolean);

    return plays.sort((a: any, b: any) => (b.avg_last_10 - b.line) - (a.avg_last_10 - a.line)).slice(0, 4);
  } catch (error) {
    return [];
  }
}