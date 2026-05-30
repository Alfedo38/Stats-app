import { NextResponse } from "next/server";
import { getHistContextBothSides } from "@/lib/histContext";

const ALLOWED_MARKETS = new Set(["PTS", "REB", "AST", "PRA", "PR", "PA", "RA", "3PT", "3PM"]);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const playerName = String(body.playerName || "").trim();
    const market = String(body.market || "").trim().toUpperCase();
    const line = Number(body.line);

    if (!playerName) {
      return NextResponse.json({ ok: false, error: "Falta playerName" }, { status: 400 });
    }
    if (!ALLOWED_MARKETS.has(market)) {
      return NextResponse.json({ ok: false, error: `Mercado no soportado: ${market}` }, { status: 400 });
    }
    if (!Number.isFinite(line)) {
      return NextResponse.json({ ok: false, error: "Línea inválida" }, { status: 400 });
    }

    const histContext = await getHistContextBothSides({
      playerName,
      market,
      line,
      opponent: body.opponent ?? null,
      homeAway: body.homeAway ?? null,
      asOfDate: body.asOfDate ?? null,
    });

    return NextResponse.json({ ok: true, histContext });
  } catch (error: any) {
    console.error("/api/hist-context error:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Error consultando histórico" },
      { status: 500 }
    );
  }
}
