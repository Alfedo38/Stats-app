import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.toLowerCase().trim();

    if (!query || query.length < 2) return NextResponse.json([]);

    // 1. Buscamos en la base de datos
    const players = await prisma.players.findMany({
      where: {
        OR: [
          { first_name: { contains: query, mode: 'insensitive' } },
          { last_name: { contains: query, mode: 'insensitive' } },
          { full_name: { contains: query, mode: 'insensitive' } }
        ],
      },
      take: 100, 
    });

    const uniqueMap = new Map();
    
    players.forEach(p => {
      let cleanName = '';
      
      // Manejo de formato "Apellido, Nombre"
      if (p.full_name && p.full_name.includes(',')) {
        const parts = p.full_name.split(',');
        cleanName = `${parts[1].trim()} ${parts[0].trim()}`;
      } else {
        cleanName = p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
      }

      if (cleanName.length > 2) {
        // Evitamos duplicados por nombre
        if (!uniqueMap.has(cleanName)) {
          uniqueMap.set(cleanName, {
            id: p.id,
            display_name: cleanName.toUpperCase(),
            image: `https://cdn.nba.com/headshots/nba/latest/260x190/${p.id}.png`
          });
        }
      }
    });

    // 2. Algoritmo de relevancia: Coincidencia exacta al principio va primero
    const sortedResults = Array.from(uniqueMap.values()).sort((a, b) => {
      const aName = a.display_name.toLowerCase();
      const bName = b.display_name.toLowerCase();
      
      const aStarts = aName.startsWith(query) || aName.includes(` ${query}`);
      const bStarts = bName.startsWith(query) || bName.includes(` ${query}`);

      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return aName.localeCompare(bName);
    });

    return NextResponse.json(sortedResults.slice(0, 8));

  } catch (error) {
    console.error("SEARCH_API_ERROR:", error);
    return NextResponse.json([]);
  }
}