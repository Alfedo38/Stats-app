import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    if (action === 'teams') {
      const teams = await prisma.matches_lol.findMany({
        select: { team_name: true },
        distinct: ['team_name'],
        orderBy: { team_name: 'asc' }
      });
      return NextResponse.json(teams.map(t => t.team_name));
    }

    if (action === 'players') {
      const players = await prisma.player_stats_lol.findMany({
        select: { player_name: true },
        distinct: ['player_name'],
        orderBy: { player_name: 'asc' }
      });
      return NextResponse.json(players.map(p => p.player_name));
    }

    if (action === 'roster') {
      const teamQuery = searchParams.get('team');
      if (!teamQuery) return NextResponse.json({ error: 'Falta el equipo' }, { status: 400 });

      const cleanName = teamQuery.replace(/\b(Esports|Gaming|Club|Team|GG|Esport|Red|White|Blue)\b/gi, '').trim();

      const lastGamesStats = await prisma.player_stats_lol.findMany({
        where: { team_name: { contains: cleanName, mode: 'insensitive' } },
        orderBy: { game_id: 'desc' },
        take: 100 
      });

      if (lastGamesStats.length === 0) {
        return NextResponse.json({ error: 'No se encontraron jugadores para este equipo' }, { status: 404 });
      }

      const roster: any = { TOP: '', JNG: '', MID: '', BOT: '', SUP: '' };
      lastGamesStats.forEach(stat => {
        const pos = stat.position.toUpperCase() as keyof typeof roster;
        if (roster[pos] === '') roster[pos] = stat.player_name;
      });

      return NextResponse.json(roster);
    }

    if (action === 'last_update') {
      const lastMatch = await prisma.matches_lol.findFirst({
        orderBy: { date: 'desc' },
        select: { date: true }
      });
      if (!lastMatch || !lastMatch.date) return NextResponse.json({ date: 'Desconocida' });
      return NextResponse.json({ date: lastMatch.date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) });
    }

    if (action === 'stats') {
      const player = searchParams.get('player');
      const champion = searchParams.get('champion');

      if (!player || !champion || player.trim() === '') {
         return NextResponse.json({ error: 'Faltan datos válidos' }, { status: 400 });
      }

      const stats = await prisma.player_stats_lol.findMany({
        where: {
          player_name: { equals: player, mode: 'insensitive' },
          champion: { equals: champion, mode: 'insensitive' }
        }
      });

      if (stats.length === 0) {
        return NextResponse.json({ games: 0, winRate: "0", kda: "0", fbRate: "0", avgDragons: "0", avgGoldDiff: 0, avgTeamKills: "0", avgTowers: "0" });
      }

      let kills = 0, deaths = 0, assists = 0, fbKills = 0, wins = 0;
      let totalDragons = 0, totalGoldDiff = 0, totalTeamKills = 0, totalTowers = 0, validMacroGames = 0;
      
      const playerTeam = stats[0].team_name;
      const gameIds = stats.map(s => s.game_id);
      const matches = await prisma.matches_lol.findMany({
        where: { game_id: { in: gameIds }, team_name: { equals: playerTeam!, mode: 'insensitive' } }
      });
      
      const matchMap = new Map();
      matches.forEach(m => matchMap.set(m.game_id, m));

      stats.forEach(s => {
        const m = matchMap.get(s.game_id);
        if (m) {
          if (m.win) wins++;
          if (m.dragons !== null) {
            totalDragons += m.dragons;
            totalGoldDiff += (m.gold_diff_at_15 || 0);
            totalTeamKills += (m.team_kills || 0);
            totalTowers += (m.towers || 0);
            validMacroGames++;
          }
        }
        kills += s.kills; deaths += s.deaths; assists += s.assists;
        if (s.first_blood_kill) fbKills++;
      });

      const games = stats.length;
      return NextResponse.json({
        games,
        winRate: ((wins / games) * 100).toFixed(1),
        kda: ((kills + assists) / Math.max(1, deaths)).toFixed(2),
        fbRate: ((fbKills / games) * 100).toFixed(1),
        avgDragons: validMacroGames > 0 ? (totalDragons / validMacroGames).toFixed(1) : "0",
        avgGoldDiff: validMacroGames > 0 ? Math.round(totalGoldDiff / validMacroGames) : 0,
        avgTeamKills: validMacroGames > 0 ? (totalTeamKills / validMacroGames).toFixed(1) : "0",
        avgTowers: validMacroGames > 0 ? (totalTowers / validMacroGames).toFixed(1) : "0"
      });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}