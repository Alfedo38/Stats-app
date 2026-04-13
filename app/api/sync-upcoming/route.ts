export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PANDA_TOKEN = process.env.PANDASCORE_TOKEN;

export async function GET() {
  try {
    if (!PANDA_TOKEN) {
      return NextResponse.json({ error: "Falta PANDASCORE_TOKEN en el .env" }, { status: 500 });
    }

    const headers = { 
      'Authorization': `Bearer ${PANDA_TOKEN}`,
      'Accept': 'application/json'
    };

    // 1. Traemos 30 EN VIVO y PRÓXIMOS (Ordenados del más urgente al más lejano)
    const upcomingRes = await fetch("https://api.pandascore.co/lol/matches?filter[status]=running,upcoming&sort=scheduled_at&per_page=30", { headers });
    const upcomingData = await upcomingRes.json();

    // 2. Traemos los últimos 30 TERMINADOS (Ordenados del más reciente al más antiguo)
    const pastRes = await fetch("https://api.pandascore.co/lol/matches?filter[status]=finished&sort=-scheduled_at&per_page=30", { headers });
    const pastData = await pastRes.json();

    // Unimos todo en un solo mega-array
    const matches = [
      ...(Array.isArray(upcomingData) ? upcomingData : []), 
      ...(Array.isArray(pastData) ? pastData : [])
    ];

    let actualizados = 0;

    for (const match of matches) {
      // Solo procesamos si hay dos equipos reales confirmados (Ignora los TBD vs TBD)
      if (match.opponents && match.opponents.length === 2) {
        
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
            status: match.status, 
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

    return NextResponse.json({ success: true, mensaje: `Sincronizados ${actualizados} partidos reales (sin contar TBD).` });

  } catch (error: any) {
    console.error("Error Sync:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}