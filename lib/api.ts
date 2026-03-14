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

// 3. DETALLES DE UN JUGADOR (Con Autocompletado Inteligente)
export async function getPlayerData(playerId: string) {
  try {
    const id = parseInt(playerId);
    if (isNaN(id)) return { player: null, stats: [] };

    // 1. Buscamos en la tabla de jugadores
    let player = await prisma.players.findUnique({
      where: { id: id }
    });

    // 2. Buscamos sus partidos
    const stats = await prisma.player_game_logs.findMany({
      where: { player_id: id },
      orderBy: { game_date: 'desc' }
    });
    
    // 3. MAGIA: Si el jugador no está en la DB pero SÍ tiene partidos, lo "inventamos"
    if (!player && stats.length > 0) {
      const fullName = stats[0].player_name || "Jugador";
      const nameParts = fullName.split(' ');
      
      player = {
        id: id,
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(' '),
        full_name: fullName,
        team_id: null,
        api_id: null,
        jersey_number: null,
        position: null,
        image_url: null
      } as any;
    }

    // Serializamos la fecha para que Next.js no se queje
    const serializedStats = stats.map(s => ({
      ...s,
      game_date: s.game_date ? s.game_date.toISOString() : null
    }));

    // Retornamos jugador (real o inventado) y sus stats
    return { player, stats: serializedStats };
  } catch (e) {
    console.error("Error en getPlayerData:", e);
    return { player: null, stats: [] };
  }
}

// 4. JUGADORES ON FIRE (Trending)
export async function getTrendingPlayers() {
  try {
    // 1. Traemos los logs pero asegurándonos de que no haya basura
    const playersWithLogs = await prisma.players.findMany({
      include: {
        player_game_logs: {
          orderBy: { game_date: 'desc' },
          take: 5, // Solo los últimos 5
        }
      }
    });

    return playersWithLogs
      .map(player => {
        const logs = player.player_game_logs;
        if (logs.length === 0) return null;

        // Calculamos el promedio real basado SOLO en esos 5 partidos
        const totalPts = logs.reduce((sum, log) => sum + (log.pts || 0), 0);
        const avg_pts = (totalPts / logs.length).toFixed(1);

        return {
          id: player.id,
          first_name: player.first_name,
          last_name: player.last_name,
          team: logs[0].team_abbreviation,
          avg_pts: parseFloat(avg_pts)
        };
      })
      .filter(p => p !== null)
      .sort((a, b) => b.avg_pts - a.avg_pts) // Ordenar por los que más anotan
      .slice(0, 4); // Top 4 para la home
  } catch (e) {
    return [];
  }
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