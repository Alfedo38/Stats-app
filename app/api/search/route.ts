import { withAuth } from '@/lib/auth/server';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAllCurrentRosterPlayers, getCurrentRosterPlayer } from '@/lib/currentRosters';

export const GET = withAuth(handleGET);
async function handleGET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.toLowerCase().trim();

    if (!query || query.length < 2) return NextResponse.json([]);

    // 1. Buscamos JUGADORES y EQUIPOS en paralelo
    const [players, teams] = await Promise.all([
      prisma.players.findMany({
        where: {
          OR: [
            { first_name: { contains: query, mode: 'insensitive' } },
            { last_name: { contains: query, mode: 'insensitive' } },
            { full_name: { contains: query, mode: 'insensitive' } }
          ],
        },
        take: 10,
      }),
      prisma.teams.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { abbreviation: { contains: query, mode: 'insensitive' } }
          ],
        },
        take: 5,
      })
    ]);

    // 2. Formateamos los resultados para que el componente los entienda
    const playerById = new Map<number, any>();
    for (const player of players) playerById.set(player.id, player);
    for (const rosterPlayer of getAllCurrentRosterPlayers()) {
      if (!rosterPlayer.full_name.toLowerCase().includes(query)) continue;
      if (!playerById.has(rosterPlayer.player_id)) {
        playerById.set(rosterPlayer.player_id, {
          id: rosterPlayer.player_id,
          full_name: rosterPlayer.full_name,
          first_name: rosterPlayer.full_name.split(' ')[0],
          last_name: rosterPlayer.full_name.split(' ').slice(1).join(' '),
        });
      }
    }

    const playerResults = Array.from(playerById.values())
      .slice(0, 10)
      .map((player) => {
        const rosterPlayer = getCurrentRosterPlayer(player.id);
        return {
          id: player.id,
          type: 'player',
          display_name:
            player.full_name?.toUpperCase() ||
            `${player.first_name} ${player.last_name}`.toUpperCase(),
          subtitle: rosterPlayer
            ? `${rosterPlayer.team_abbreviation} · NBA Player`
            : 'NBA Player',
        };
      });

    const teamResults = teams.map(t => ({
      id: t.abbreviation,
      type: 'team',
      display_name: (t.name ?? '').toUpperCase(),
      subtitle: `Team - ${t.abbreviation}`,
    }));

    // Unimos todo, poniendo los equipos primero si la búsqueda es corta
    return NextResponse.json([...teamResults, ...playerResults]);

  } catch (error) {
    console.error("SEARCH_API_ERROR:", error);
    return NextResponse.json([]);
  }
}
