// app/api/search/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) return NextResponse.json([]);

  const players = await prisma.players.findMany({
    where: {
      full_name: {
        contains: query,
        mode: 'insensitive',
      },
    },
    take: 10,
  });

  return NextResponse.json(players);
}