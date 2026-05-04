import prisma from './prisma';
import { createClient } from '@supabase/supabase-js';

// 🔌 CONEXIÓN A SUPABASE (Usa tu .env)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

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

    // 1. Traemos las stats del partido completo usando Prisma
    const stats = await prisma.player_game_logs.findMany({
      where: { player_id: id },
      orderBy: { game_date: 'desc' }
    });

    // 🟢 2. NUEVO: Traemos las stats del Q1 usando Supabase directo
    const { data: q1Data } = await supabase
      .from('player_q1_stats')
      .select('game_id, q1_pts, q1_reb, q1_ast, q1_oreb, q1_dreb')
      .eq('player_id', id);

    // 3. Armamos un diccionario para cruzar los datos ultra rápido
    const q1Dict: Record<number, any> = {};
    if (q1Data) {
      q1Data.forEach((q1: any) => {
        // Usamos Number() para matar los ceros a la izquierda y evitar el bug
        q1Dict[Number(q1.game_id)] = q1;
      });
    }
    
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

    // 4. Serializamos e INYECTAMOS los datos del Q1 en los logs
    const serializedStats = stats.map(s => {
      // Buscamos el partido en nuestro diccionario (convirtiendo el ID a número)
      const q1 = q1Dict[Number(s.game_id)] || {};
      
      return {
        ...s,
        game_date: s.game_date ? s.game_date.toISOString() : null,
        // Agregamos las columnas Q1 (si el partido no tiene, mandamos 0)
        q1_pts: q1.q1_pts || 0,
        q1_reb: q1.q1_reb || 0,
        q1_ast: q1.q1_ast || 0,
        q1_oreb: q1.q1_oreb || 0,
        q1_dreb: q1.q1_dreb || 0,
      };
    });

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

// 5. CEREBRO EV+ LUDOGALLINA (Ahora lee de Supabase en vez de local)
export async function getEvPlays() {
  try {
    // 💾 Traemos la cartelera fresca desde Supabase
    const { data: dbData, error } = await supabase
      .from('ludo_picks')
      .select('json_data')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !dbData) {
      console.warn("⚠️ No se encontraron picks en Supabase o hubo un error:", error);
      return [];
    }

    const data = dbData.json_data;

    // 📡 Mantenemos intacta tu lógica de ESPN para las pestañas de HOY / MAÑANA
    const todayGames = await getTodayScoreboard();

    if (!todayGames || todayGames.length === 0) {
      // Si falla ESPN, asumimos que todos son de hoy para no romper la web
      return data.map((b: any) => ({ ...b, is_today: true }));
    }

    const equiposDeHoy = new Set<string>();
    todayGames.forEach((game: any) => {
      if (game.competitions && game.competitions[0].competitors) {
        game.competitions[0].competitors.forEach((comp: any) => {
          equiposDeHoy.add(comp.team.displayName);
        });
      }
    });

    const dataConFechas = data.map((bloque: any) => {
      let esDeHoy = false;
      equiposDeHoy.forEach((equipo) => {
        if (bloque.matchup.includes(equipo)) esDeHoy = true;
      });
      
      return {
        ...bloque,
        is_today: esDeHoy
      };
    });

    return dataConFechas;

  } catch (e) { 
    console.error("Error en el Cerebro EV+:", e);
    return []; 
  }
}

// 6. RADAR SOCIAL (Tendencias de Reddit)
export async function getRedditTrends() {
  try {
    const trends = await prisma.reddit_trends.findMany({
      orderBy: { hype_score: 'desc' }, 
      take: 12 
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
      next: { revalidate: 60 } 
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
      next: { revalidate: 300 } 
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
    const teamsWithInjuries = await getNBAInjuries();
    const outPlayers = teamsWithInjuries.flatMap((t: any) => 
      t.injuries.filter((i: any) => i.status.toLowerCase().includes('out'))
                .map((i: any) => i.athlete.displayName)
    );

    const playersWithLogs = await prisma.players.findMany({
      include: {
        player_game_logs: {
          orderBy: { game_date: 'desc' },
          take: 10,
        }
      }
    });

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