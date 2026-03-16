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

// 2. ROSTER DEL EQUIPO (Escudo Anti-Bugs por Consenso)
export async function getTeamPlayers(teamAbbr: string) {
  try {
    if (!teamAbbr) return [];
    const cleanAbbr = teamAbbr.trim().toUpperCase();

    const candidates = await prisma.player_game_logs.findMany({
      where: { team_abbreviation: { equals: cleanAbbr, mode: 'insensitive' } },
      distinct: ['player_id'],
      select: { player_id: true }
    });

    const playerIds = candidates.map(c => c.player_id);
    if (playerIds.length === 0) return [];

    const recentLogs = await prisma.player_game_logs.findMany({
      where: { player_id: { in: playerIds } },
      orderBy: { game_date: 'desc' }
    });

    const logsByPlayer: Record<number, any[]> = {};
    for (const log of recentLogs) {
      if (!logsByPlayer[log.player_id]) logsByPlayer[log.player_id] = [];
      if (logsByPlayer[log.player_id].length < 5) {
        logsByPlayer[log.player_id].push(log);
      }
    }

    const finalRoster = [];

    for (const [pIdStr, logs] of Object.entries(logsByPlayer)) {
      const teamCounts: Record<string, number> = {};
      let trueTeam = '';
      let maxCount = 0;

      for (const log of logs) {
        const t = log.team_abbreviation?.toUpperCase();
        if (!t) continue;
        teamCounts[t] = (teamCounts[t] || 0) + 1;
        
        if (teamCounts[t] > maxCount) {
          maxCount = teamCounts[t];
          trueTeam = t;
        }
      }

      if (trueTeam === cleanAbbr) {
        finalRoster.push({
          id: parseInt(pIdStr),
          full_name: logs[0].player_name, 
          team: trueTeam
        });
      }
    }

    return finalRoster.sort((a, b) => a.full_name.localeCompare(b.full_name));

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

    let player = await prisma.players.findUnique({
      where: { id: id }
    });

    const stats = await prisma.player_game_logs.findMany({
      where: { player_id: id },
      orderBy: { game_date: 'desc' }
    });
    
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
    const playersWithLogs = await prisma.players.findMany({
      include: {
        player_game_logs: {
          orderBy: { game_date: 'desc' },
          take: 5,
        }
      }
    });

    return playersWithLogs
      .map(player => {
        const logs = player.player_game_logs;
        if (logs.length === 0) return null;

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
      .sort((a, b) => b.avg_pts - a.avg_pts)
      .slice(0, 4);
  } catch (e) {
    return [];
  }
}

// 5. CEREBRO EV+ (Expected Value Avanzado + Gráfico)
export async function getEvPlays() {
  try {
    const odds = await prisma.player_odds.findMany();
    if (!odds || odds.length === 0) return [];

    const playerNames = odds.map(o => o.player_name);

    const logs = await prisma.player_game_logs.findMany({
      where: { player_name: { in: playerNames } },
      orderBy: { game_date: 'desc' }
    });

    const plays = odds.map(odd => {
      const pLogs = logs.filter(l => l.player_name === odd.player_name).slice(0, 10);
      
      if (pLogs.length < 5) return null; 

      const totalStats = pLogs.reduce((acc, curr) => acc + (curr.pts || 0), 0);
      const avg = totalStats / pLogs.length;

      const hits = pLogs.filter(l => (l.pts || 0) > odd.line).length;
      const hitRate = (hits / pLogs.length) * 100;

      const edge = ((avg - odd.line) / odd.line) * 100;

      if (avg > odd.line && hitRate >= 60) {
        return {
          player_id: pLogs[0].player_id,
          player_name: odd.player_name,
          team: pLogs[0].team_abbreviation,
          matchup: odd.matchup,
          line: odd.line,
          avg_last_10: avg.toFixed(1),
          over_hits: hits,
          games_played: pLogs.length,
          hit_rate: hitRate.toFixed(0),
          edge: edge.toFixed(1),
          recent_logs: pLogs.map(l => ({
            game_date: l.game_date ? l.game_date.toISOString() : null,
            matchup: l.matchup,
            value: l.pts || 0 
          }))
        };
      }
      return null;
    }).filter(Boolean); 

    return plays
      .sort((a: any, b: any) => parseFloat(b.edge) - parseFloat(a.edge))
      .slice(0, 8);

  } catch (e) { 
    console.error("Error en el Cerebro EV+:", e);
    return []; 
  }
}
// 6. RADAR SOCIAL (Tendencias de Reddit)
export async function getRedditTrends() {
  try {
    const trends = await prisma.reddit_trends.findMany({
      orderBy: { hype_score: 'desc' }, // Los más calientes arriba
      take: 12 // Traemos el Top 12
    });
    return trends;
  } catch (e) {
    console.error("Error en el Radar Social:", e);
    return [];
  }
}
// 7. CARTELERA DE HOY (ESPN)
export async function getTodayScoreboard() {
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', {
      next: { revalidate: 60 } // Se actualiza cada 1 minuto
    });
    const data = await res.json();
    return data.events || [];
  } catch (e) {
    console.error("Error cargando ESPN Scoreboard:", e);
    return [];
  }
}
// 8. REPORTE DE LESIONES (ESPN)
export async function getNBAInjuries() {
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries', {
      next: { revalidate: 300 } // Se actualiza cada 5 minutos
    });
    const data = await res.json();
    return data.teams || [];
  } catch (e) {
    console.error("Error cargando lesionados:", e);
    return [];
  }
}
// 9. ESCÁNER DE RENDIMIENTO PURO (PTS, REB, AST, PRA)
export async function getTopPerformers() {
  try {
    // 1. Lesionados (ESPN)
    const teamsWithInjuries = await getNBAInjuries();
    const outPlayers = teamsWithInjuries.flatMap((t: any) => 
      t.injuries.filter((i: any) => i.status.toLowerCase().includes('out'))
                .map((i: any) => i.athlete.displayName)
    );

    // 2. Traemos jugadores y sus últimos 10 partidos de la tabla 'players'
    const playersWithLogs = await prisma.players.findMany({
      include: {
        player_game_logs: {
          orderBy: { game_date: 'desc' },
          take: 10,
        }
      }
    });

    // 3. Filtramos y calculamos promedios
    const processedPlayers = playersWithLogs
      .filter(p => !outPlayers.includes(`${p.first_name} ${p.last_name}`))
      .map(p => {
        const logs = p.player_game_logs;
        const count = logs.length || 1;
        
        return {
          id: p.id,
          full_name: `${p.first_name} ${p.last_name}`,
          team_abbr: logs[0]?.team_abbreviation || 'NBA',
          pts_avg: logs.reduce((sum, l) => sum + (l.pts || 0), 0) / count,
          reb_avg: logs.reduce((sum, l) => sum + (l.reb || 0), 0) / count,
          ast_avg: logs.reduce((sum, l) => sum + (l.ast || 0), 0) / count,
        };
      });

    // 4. Devolvemos los mejores por categoría
    return {
      puntos: [...processedPlayers].sort((a, b) => b.pts_avg - a.pts_avg).slice(0, 3),
      rebotes: [...processedPlayers].sort((a, b) => b.reb_avg - a.reb_avg).slice(0, 3),
      asistencias: [...processedPlayers].sort((a, b) => b.ast_avg - a.ast_avg).slice(0, 3),
      pra: [...processedPlayers]
        .sort((a, b) => (b.pts_avg + b.reb_avg + b.ast_avg) - (a.pts_avg + a.reb_avg + a.ast_avg))
        .slice(0, 3)
    };
  } catch (e) {
    console.error("Error en getTopPerformers:", e);
    return { puntos: [], rebotes: [], asistencias: [], pra: [] };
  }
}