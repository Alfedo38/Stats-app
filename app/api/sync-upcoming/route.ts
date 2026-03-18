import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PANDA_TOKEN = process.env.PANDASCORE_TOKEN;

export async function GET() {
  try {
    if (!PANDA_TOKEN) {
      return NextResponse.json({ error: "Falta PANDASCORE_TOKEN en el .env" }, { status: 500 });
    }

    // Traemos los últimos 20 partidos (mezcla de pasados y futuros) para tener agenda y resultados
    const response = await fetch(
      "https://api.pandascore.co/lol/matches?sort=-scheduled_at&per_page=20",
      {
        headers: { 
          'Authorization': `Bearer ${PANDA_TOKEN}`,
          'Accept': 'application/json'
        }
      }
    );

    const matches = await response.json();

    if (!Array.isArray(matches)) {
      return NextResponse.json({ error: "Respuesta de API inválida", matches }, { status: 500 });
    }

    let actualizados = 0;

    for (const match of matches) {
      // Solo procesamos si hay dos equipos definidos
      if (match.opponents && match.opponents.length === 2) {
        
        // Extraemos los scores finales de la serie
        const sA = match.results.find((r: any) => r.team_id === match.opponents[0].opponent.id)?.score || 0;
        const sB = match.results.find((r: any) => r.team_id === match.opponents[1].opponent.id)?.score || 0;

        await prisma.upcoming_matches_lol.upsert({
          where: { panda_id: match.id },
          update: {
            scheduled_at: new Date(match.scheduled_at),
            league: match.league.name,
            team_a: match.opponents[0].opponent.name,
            team_b: match.opponents[1].opponent.name,
            score_a: sA,
            score_b: sB,
            status: match.status, // "finished", "upcoming", "running"
          },
          create: {
            panda_id: match.id,
            scheduled_at: new Date(match.scheduled_at),
            league: match.league.name,
            team_a: match.opponents[0].opponent.name,
            team_b: match.opponents[1].opponent.name,
            score_a: sA,
            score_b: sB,
            status: match.status,
          },
        });
        actualizados++;
      }
    }

    return NextResponse.json({ success: true, mensaje: `Sincronizados ${actualizados} partidos.` });

  } catch (error: any) {
    console.error("Error Sync:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}