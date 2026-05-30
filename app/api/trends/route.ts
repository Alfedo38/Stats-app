// app/api/trends/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const player = req.nextUrl.searchParams.get("player") ?? "";
  if (!player) return NextResponse.json({ trend: null });

  try {
    const trend = await prisma.reddit_trends.findFirst({
      where: {
        player_name: { contains: player, mode: "insensitive" },
      },
    });
    return NextResponse.json({ trend });
  } catch (err: any) {
    console.error("[/api/trends] Error:", err);
    return NextResponse.json({ trend: null });
  }
}
