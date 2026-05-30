import prisma from "@/lib/prisma";

export type HistSide = "over" | "under";

export type HistContextRequest = {
  playerName: string;
  market: string;
  line: number;
  side: HistSide;
  opponent?: string | null;
  homeAway?: "HOME" | "AWAY" | string | null;
  asOfDate?: string | null;
};

export type HistBucket = {
  bucket?: string;
  label?: string;
  games?: number;
  hits?: number;
  hit_rate?: number;
  rate?: number;
  avg?: number;
  [key: string]: any;
};

export type HistContext = {
  summary?: {
    hist_score?: number;
    hist_grade?: string;
    l5_rate?: number;
    l10_rate?: number;
    vs_opp_rate?: number;
    home_away_rate?: number;
    all_rate?: number;
    avg_edge?: number;
    explanation_base?: string;
    [key: string]: any;
  };
  buckets?: HistBucket[];
  [key: string]: any;
};

function cleanDate(value?: string | null) {
  if (!value) return null;
  const raw = String(value);
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

export async function getHistContext({
  playerName,
  market,
  line,
  side,
  opponent = null,
  homeAway = null,
  asOfDate = null,
}: HistContextRequest): Promise<HistContext | null> {
  if (!playerName || !market || !Number.isFinite(Number(line)) || !side) return null;

  const rows = await prisma.$queryRaw<Array<{ hist_context: any }>>`
    SELECT nba_api_data.fn_ludo_hist_pick_context_json(
      ${playerName}::text,
      ${market.toUpperCase()}::text,
      ${Number(line)}::numeric,
      ${side.toLowerCase()}::text,
      ${opponent ? String(opponent).toUpperCase() : null}::text,
      ${homeAway ? String(homeAway).toUpperCase() : null}::text,
      ${cleanDate(asOfDate)}::date
    ) AS hist_context
  `;

  return rows?.[0]?.hist_context ?? null;
}

export async function getHistContextBothSides(args: Omit<HistContextRequest, "side">) {
  const [over, under] = await Promise.all([
    getHistContext({ ...args, side: "over" }),
    getHistContext({ ...args, side: "under" }),
  ]);

  return { over, under };
}
