// app/api/injuries/route.ts
import { NextResponse } from "next/server";
import { getInjuries } from "@/lib/api";

export async function GET() {
  try {
    const players = await getInjuries();
    return NextResponse.json({
      source:       "NBA_INJURIES",
      total_rows:   players.length,
      snapshot_at:  new Date().toISOString(),
      players,
    });
  } catch (err: any) {
    console.error("[/api/injuries] Error:", err);
    return NextResponse.json(
      { error: "Error al cargar injury report", detail: err?.message },
      { status: 500 }
    );
  }
}
