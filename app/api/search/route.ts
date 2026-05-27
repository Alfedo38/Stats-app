import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
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
    const playerResults = players.map(p => ({
      id: p.id,
      type: 'player',
      display_name: p.full_name?.toUpperCase() || `${p.first_name} ${p.last_name}`.toUpperCase(),
      subtitle: 'NBA Player',
      image: `https://cdn.nba.com/headshots/nba/latest/260x190/${p.id}.png`
    }));

    const teamResults = teams.map(t => ({
      id: t.abbreviation,
      type: 'team',
      display_name: (t.name ?? '').toUpperCase(),
      subtitle: `Team - ${t.abbreviation}`,
      image: `https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${(t.abbreviation ?? '').toLowerCase()}.png`
    }));

    // Unimos todo, poniendo los equipos primero si la búsqueda es corta
    return NextResponse.json([...teamResults, ...playerResults]);

  } catch (error) {
    console.error("SEARCH_API_ERROR:", error);
    return NextResponse.json([]);
  }
}