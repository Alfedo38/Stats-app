import prisma from './prisma';

// 1. OBTENER TODOS LOS EQUIPOS
export async function getTeams() {
  try {
    return await prisma.teams.findMany({
      orderBy: { name: 'asc' }
    });
  } catch (error) {
    console.error("Error en getTeams:", error);
    return [];
  }
}

// 2. OBTENER JUGADORES DE UN EQUIPO ESPECÍFICO (Faltaba esta!)
export async function getTeamPlayers(teamAbbr: string) {
  try {
    // Buscamos en los logs los jugadores únicos de esa abreviación
    const players = await prisma.player_game_logs.findMany({
      where: { team_abbreviation: teamAbbr.toUpperCase() },
      distinct: ['player_id'],
      select: {
        player_id: true,
        player_name: true,
        team_abbreviation: true
      }
    });
    return players.map(p => ({
      id: p.player_id,
      full_name: p.player_name,
      team: p.team_abbreviation
    }));
  } catch (error) {
    console.error("Error en getTeamPlayers:", error);
    return [];
  }
}

// 3. DETALLES DE UN JUGADOR (Faltaba esta!)
export async function getPlayerData(playerId: string) {
  try {
    const id = parseInt(playerId);
    const player = await prisma.players.findUnique({
      where: { id: id }
    });
    const stats = await prisma.player_game_logs.findMany({
      where: { player_id: id },
      orderBy: { game_date: 'desc' }
    });
    return { player, stats };
  } catch (error) {
    console.error("Error en getPlayerData:", error);
    return { player: null, stats: [] };
  }
}

// 4. JUGADORES EN RACHA
export async function getTrendingPlayers() {
  try {
    const logs = await prisma.player_game_logs.findMany({
      take: 400,
      orderBy: { game_date: 'desc' }
    });
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

// 5. CEREBRO EV+
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
    return plays.sort((a: any, b: any) => (Number(b.avg_last_10) - b.line) - (Number(a.avg_last_10) - a.line)).slice(0, 4);
  } catch (error) {
    return [];
  }
}