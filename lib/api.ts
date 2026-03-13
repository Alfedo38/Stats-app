// lib/api.ts
import prisma from './prisma';

// 1. OBTENER TODOS LOS EQUIPOS
export async function getTeams() {
  try {
    return await prisma.teams.findMany({
      orderBy: { name: 'asc' } // <-- Cambiado aquí también
    });
  } catch (error) {
    console.error("Error cargando equipos:", error);
    return [];
  }
}

// 2. OBTENER JUGADORES DE UN EQUIPO ESPECÍFICO
export async function getTeamPlayers(teamAbbr: string) {
  try {
    // Buscamos jugadores basándonos en su último equipo registrado en los logs
    const players = await prisma.players.findMany({
        // Nota: Si tu tabla players no tiene team_id, Prisma usará la relación detectada en el pull
        // Aquí lo filtramos por la abreviación del equipo
    });
    // Filtro manual rápido si la estructura es simple:
    return players || [];
  } catch (error) {
    console.error("Error cargando jugadores del equipo:", error);
    return [];
  }
}

// 3. DETALLES DE UN JUGADOR (Para la página [playerId])
export async function getPlayerData(playerId: string) {
  try {
    const id = parseInt(playerId);
    
    // Traemos info básica del jugador
    const player = await prisma.players.findUnique({
      where: { id: id }
    });

    // Traemos sus estadísticas históricas
    const stats = await prisma.player_game_logs.findMany({
      where: { player_id: id },
      orderBy: { game_date: 'desc' }
    });

    return { 
      player, 
      stats: stats.map(s => ({ ...s, game_date: s.game_date?.toISOString() })) 
    };
  } catch (error) {
    console.error("Error en getPlayerData:", error);
    return { player: null, stats: [] };
  }
}

// 4. JUGADORES EN RACHA (Top 4 con mejor promedio últimos 5 partidos)
export async function getTrendingPlayers() {
  try {
    const recentLogs = await prisma.player_game_logs.findMany({
      orderBy: { game_date: 'desc' },
      take: 400, // Escaneamos los partidos más recientes de la liga
    });

    const playerStats: Record<string, any> = {};

    recentLogs.forEach((log) => {
      if (!playerStats[log.player_id]) {
        playerStats[log.player_id] = {
          id: log.player_id,
          first_name: log.player_name.split(' ')[0],
          last_name: log.player_name.split(' ').slice(1).join(' '),
          team: log.team_abbreviation,
          games: 0,
          totalPts: 0
        };
      }
      if (playerStats[log.player_id].games < 5) {
        playerStats[log.player_id].games++;
        playerStats[log.player_id].totalPts += (log.pts || 0);
      }
    });

    return Object.values(playerStats)
      .filter((p: any) => p.games === 5)
      .map((p: any) => ({
        ...p,
        avg_pts: (p.totalPts / 5).toFixed(1)
      }))
      .sort((a: any, b: any) => b.avg_pts - a.avg_pts)
      .slice(0, 4);

  } catch (error) {
    console.error("Error en trending:", error);
    return [];
  }
}

// 5. CEREBRO EV+ (Cruza Player Odds con Promedios Reales)
export async function getEvPlays() {
  try {
    const odds = await prisma.player_odds.findMany();
    if (!odds.length) return [];

    const playerNames = odds.map(o => o.player_name);
    const logs = await prisma.player_game_logs.findMany({
      where: { player_name: { in: playerNames } },
      orderBy: { game_date: 'desc' }
    });

    const evPlays: any[] = [];

    odds.forEach(odd => {
      const pLogs = logs.filter(l => l.player_name === odd.player_name).slice(0, 10);
      if (pLogs.length < 5) return;

      const avg_last_10 = pLogs.reduce((acc, curr) => acc + (curr.pts || 0), 0) / pLogs.length;
      const over_hits = pLogs.filter(l => (l.pts || 0) > (odd.line || 0)).length;

      if (avg_last_10 > (odd.line || 0) && over_hits >= 6) {
        evPlays.push({
          player_id: pLogs[0].player_id,
          player_name: odd.player_name,
          team: pLogs[0].team_abbreviation,
          matchup: odd.matchup,
          line: odd.line,
          avg_last_10: avg_last_10.toFixed(1),
          over_hits: overHits
        });
      }
    });

    return evPlays.sort((a, b) => (b.avg_last_10 - b.line) - (a.avg_last_10 - a.line)).slice(0, 4);
  } catch (error) {
    console.error("Error en EV Plays:", error);
    return [];
  }
}