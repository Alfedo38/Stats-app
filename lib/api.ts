import prisma from './prisma';

// 1. OBTENER TODOS LOS EQUIPOS
export async function getTeams() {
  try {
    return await prisma.teams.findMany({ 
      orderBy: { name: 'asc' } 
    });
  } catch (e) {
    console.error("Error en getTeams:", e);
    return [];
  }
}

// 2. ROSTER DEL EQUIPO (Corregido y Mejorado)
export async function getTeamPlayers(teamAbbr: string) {
  try {
    if (!teamAbbr) return [];
    
    // Limpiamos la abreviación: quitamos espacios y pasamos a mayúsculas
    const cleanAbbr = teamAbbr.trim().toUpperCase();

    const players = await prisma.player_game_logs.findMany({
      where: { 
        team_abbreviation: {
          equals: cleanAbbr,
          mode: 'insensitive' // Ignora mayúsculas/minúsculas en la DB
        } 
      },
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
  } catch (e) {
    console.error("Error en getTeamPlayers:", e);
    return [];
  }
}

// 3. DETALLES DE UN JUGADOR
export async function getPlayerData(playerId: string) {
  try {
    const id = parseInt(playerId);
    if (isNaN(id)) return { player: null, stats: [] };

    const player = await prisma.players.findUnique({
      where: { id: id }
    });

    const stats = await prisma.player_game_logs.findMany({
      where: { player_id: id },
      orderBy: { game_date: 'desc' }
    });
    
    const serializedStats = stats.map(s => ({
      ...s,
      game_date: s.game_date ? s.game_date.toISOString() : null
    }));

    return { player, stats: serializedStats };
  } catch (e) {
    console.error("Error en getPlayerData:", e);
    return { player: null, stats: [] };
  }
}

// 4. JUGADORES ON FIRE (Trending)
export async function getTrendingPlayers() {
  try {
    const logs = await prisma.player_game_logs.findMany({
      take: 500,
      orderBy: { game_date: 'desc' }
    });
    const stats: any = {};
    logs.forEach(l => {
      const pid = l.player_id;
      if (!stats[pid]) {
        stats[pid] = { 
          id: pid, 
          first_name: l.player_name?.split(' ')[0] || '', 
          last_name: l.player_name?.split(' ').slice(1).join(' ') || '',
          team: l.team_abbreviation, total: 0, count: 0 
        };
      }
      if (stats[pid].count < 5) {
        stats[pid].total += (l.pts || 0);
        stats[pid].count++;
      }
    });
    return Object.values(stats)
      .filter((p: any) => p.count >= 3)
      .map((p: any) => ({ ...p, avg_pts: (p.total / p.count).toFixed(1) }))
      .sort((a: any, b: any) => Number(b.avg_pts) - Number(a.avg_pts))
      .slice(0, 4);
  } catch (e) { return []; }
}

// 5. CEREBRO EV+
export async function getEvPlays() {
  try {
    const odds = await prisma.player_odds.findMany();
    const playerNames = odds.map(o => o.player_name);
    const logs = await prisma.player_game_logs.findMany({
      where: { player_name: { in: playerNames } },
      orderBy: { game_date: 'desc' }
    });
    const plays = odds.map(odd => {
      const pLogs = logs.filter(l => l.player_name === odd.player_name).slice(0, 10);
      if (pLogs.length < 3) return null;
      const avg = pLogs.reduce((acc, curr) => acc + (curr.pts || 0), 0) / pLogs.length;
      const hits = pLogs.filter(l => (l.pts || 0) > odd.line).length;
      if (avg > odd.line) {
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
  } catch (e) { return []; }
}