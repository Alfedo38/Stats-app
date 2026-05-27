// app/api/injuries/route.ts
//
// ✏️  Conectá acá con tu base de datos.
// El componente InjuryWithWOPanel hace fetch a /api/injuries
// y espera recibir un objeto InjuryReport:
//
//  {
//    players: InjuredPlayer[],
//    source?: string,
//    snapshot_at?: string,
//    total_rows?: number
//  }
//
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";

// ✏️  OPCIÓN A: Supabase
// import { createClient } from "@/lib/supabase/server";
//
// ✏️  OPCIÓN B: Prisma
// import { prisma } from "@/lib/prisma";
//
// ✏️  OPCIÓN C: tu propio pool de Postgres
// import { db } from "@/lib/db";

export async function GET() {
  try {

    // ── ✏️  REEMPLAZÁ ESTE BLOQUE con tu query real ──────────────────────────
    //
    // Estructura esperada de cada fila en tu tabla de injuries:
    //
    //   player_name        TEXT       — nombre completo del jugador
    //   team_name          TEXT       — nombre completo del equipo
    //   team_abbreviation  TEXT       — abreviación (OKC, SAS, etc.)
    //   team_logo          TEXT|NULL  — URL al logo (opcional)
    //   status             TEXT       — 'OUT' | 'DOUBTFUL' | 'QUESTIONABLE' | 'PROBABLE'
    //   reason             TEXT|NULL  — motivo (ej. "Knee - Rest")
    //   updated_at         TIMESTAMPTZ— cuándo se actualizó el registro
    //
    // ── Ejemplo con Supabase ─────────────────────────────────────────────────
    //
    // const supabase = createClient();
    // const { data, error } = await supabase
    //   .from("injuries")                        // ← tu nombre de tabla
    //   .select(`
    //     player_name,
    //     team_name,
    //     team_abbreviation,
    //     team_logo,
    //     status,
    //     reason,
    //     updated_at
    //   `)
    //   .order("updated_at", { ascending: false });
    //
    // if (error) throw error;
    //
    // return NextResponse.json({
    //   source: "NBAINJURIES",
    //   total_rows: data.length,
    //   snapshot_at: data[0]?.updated_at ?? new Date().toISOString(),
    //   players: data,
    // });
    //
    // ── Ejemplo con Prisma ───────────────────────────────────────────────────
    //
    // const rows = await prisma.injury.findMany({
    //   select: {
    //     player_name: true,
    //     team_name: true,
    //     team_abbreviation: true,
    //     team_logo: true,
    //     status: true,
    //     reason: true,
    //     updated_at: true,
    //   },
    //   orderBy: { updated_at: "desc" },
    // });
    //
    // return NextResponse.json({
    //   source: "NBAINJURIES",
    //   total_rows: rows.length,
    //   snapshot_at: rows[0]?.updated_at?.toISOString() ?? new Date().toISOString(),
    //   players: rows,
    // });
    //
    // ────────────────────────────────────────────────────────────────────────

    // MOCK temporal — borralo cuando conectes tu BD
    const mockData = {
      source: "NBAINJURIES",
      total_rows: 3,
      snapshot_at: new Date().toISOString(),
      players: [
        {
          player_name: "Ajay Mitchell",
          team_name: "Oklahoma City Thunder",
          team_abbreviation: "OKC",
          team_logo: "https://a.espncdn.com/i/teamlogos/nba/500/okc.png",
          status: "OUT",
          reason: "Foot",
          updated_at: new Date().toISOString(),
        },
        {
          player_name: "Thomas Sorber",
          team_name: "Oklahoma City Thunder",
          team_abbreviation: "OKC",
          team_logo: "https://a.espncdn.com/i/teamlogos/nba/500/okc.png",
          status: "OUT",
          reason: "Knee",
          updated_at: new Date().toISOString(),
        },
        {
          player_name: "Jalen Williams",
          team_name: "Oklahoma City Thunder",
          team_abbreviation: "OKC",
          team_logo: "https://a.espncdn.com/i/teamlogos/nba/500/okc.png",
          status: "QUESTIONABLE",
          reason: "Ankle",
          updated_at: new Date().toISOString(),
        },
      ],
    };

    return NextResponse.json(mockData);

  } catch (err: any) {
    console.error("[/api/injuries] Error:", err);
    return NextResponse.json(
      { error: "Error al cargar injury report", detail: err?.message },
      { status: 500 }
    );
  }
}