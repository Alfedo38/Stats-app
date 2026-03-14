import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.toLowerCase().trim();

    if (!query || query.length < 2) return NextResponse.json([]);

    // 1. Red de pesca gigante: traemos 200 para que ningún "Caleb" nos tape a LeBron o Alperen
    const players = await prisma.players.findMany({
      where: {
        OR: [
          { first_name: { contains: query, mode: 'insensitive' } },
          { last_name: { contains: query, mode: 'insensitive' } },
          { full_name: { contains: query, mode: 'insensitive' } }
        ],
      },
      take: 200, 
    });

    const uniqueMap = new Map();
    
    // 2. Limpieza de nombres y eliminación de duplicados
    players.forEach(p => {
      let cleanName = '';
      
      // Arreglamos el formato "APELLIDO, NOMBRE" si viene así de la base de datos
      if (p.full_name && p.full_name.includes(',')) {
        const parts = p.full_name.split(',');
        cleanName = `${parts[1].trim()} ${parts[0].trim()}`;
      } else {
        cleanName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
      }

      if (cleanName.length > 2) {
        // Priorizamos el ID más alto si hay duplicados (suele ser el oficial de NBA)
        if (!uniqueMap.has(cleanName) || p.id > uniqueMap.get(cleanName).id) {
          uniqueMap.set(cleanName, {
            id: p.id,
            display_name: cleanName.toUpperCase(),
            image: `https://cdn.nba.com/headshots/nba/latest/260x190/${p.id}.png`
          });
        }
      }
    });

    // 3. EL TRUCO: Ordenamos para que las coincidencias exactas vayan PRIMERO
    const sortedResults = Array.from(uniqueMap.values()).sort((a, b) => {
      const aName = a.display_name.toLowerCase();
      const bName = b.display_name.toLowerCase();
      
      // Chequeamos si el nombre o el apellido EMPIEZAN con la búsqueda
      const aStarts = aName.startsWith(query) || aName.includes(` ${query}`);
      const bStarts = bName.startsWith(query) || bName.includes(` ${query}`);

      // Si 'a' empieza con "LEB" (LeBron) y 'b' no (Caleb), 'a' va primero
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return 0; // Si ambos empatan, se quedan como están
    });

    // Devolvemos solo los 8 mejores
    return NextResponse.json(sortedResults.slice(0, 8));

  } catch (error) {
    console.error("SEARCH_API_ERROR:", error);
    return NextResponse.json([]);
  }
}