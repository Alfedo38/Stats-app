"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDateOnly, formatMinutes, formatNumber, getDateSortValue, getMinutesValue } from "@/lib/formatters";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PlayerChartProps = {
  data: any[];
  statKey?: string;
  lineValue: number;
  overlayKey?: string | null;
  overlayLabel?: string;
  overlayColor?: string;
  overlayRatioLabel?: string;
  side?: "over" | "under";
};

const CHART_HEIGHT = 490;
const FALLBACK_WIDTH = 900;
const OVER_COLOR = "#10b981";
const UNDER_COLOR = "#ef4444";
const PUSH_COLOR = "#f59e0b";

function formatDate(value: any, withYear = false) {
  return formatDateOnly(value, { year: withYear });
}

function getOpponent(row: any) {
  const direct =
    row.opponent_clean ||
    row.opponent ||
    row.opp ||
    row.opponent_abbr ||
    row.matchup_opponent ||
    row.opponent_team ||
    row.vs_team ||
    row.team_abbreviation_opp;

  if (direct) return String(direct).toUpperCase();

  const matchup = String(row.matchup || "");
  const parts = matchup.match(/([A-Z]{2,3})\s*(?:@|vs\.?|VS)\s*([A-Z]{2,3})/i);
  if (parts) return parts[2]?.toUpperCase() || "S/D";

  return "S/D";
}

function getGameResult(row: any) {
  const raw = row.game_result ?? row.wl ?? row.result ?? row.outcome ?? null;
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  if (s === "W" || s === "WIN") return "W";
  if (s === "L" || s === "LOSS") return "L";
  return s.slice(0, 1);
}

function getMinutes(row: any) {
  const value = getMinutesValue(row);
  return formatMinutes(value);
}

function getBarState(value: number, line: number, side: "over" | "under" = "over") {
  if (!Number.isFinite(value) || !Number.isFinite(line)) return "neutral";
  if (Math.abs(value - line) < 0.0001) return "push";
  const isHit = side === "under" ? value < line : value > line;
  return isHit ? "over" : "under";
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  // Cuando hay overlay punteado, Recharts puede poner primero la línea y no la barra.
  // Forzamos a leer siempre el payload de la barra principal.
  const barPayload =
    payload.find((p: any) => p?.dataKey === "value") ?? payload[0];

  const row = barPayload?.payload;
  if (!row) return null;

  const value = Number(row.value);
  const line = Number(row.lineValue);
  const side = row._chartSide === "under" ? "under" : "over";
  const state = getBarState(value, line, side);
  const color = state === "over" ? OVER_COLOR : state === "under" ? UNDER_COLOR : PUSH_COLOR;

  return (
    <div className="rounded-2xl border border-[#10b981]/25 bg-black/95 p-3 shadow-2xl shadow-[#10b981]/10 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-widest text-cyan-300">
          {formatDate(row.game_date)} · vs {getOpponent(row)}
        </div>
        {getGameResult(row) && (
          <span className={`rounded-lg border px-2 py-0.5 text-[9px] font-black ${getGameResult(row) === "W" ? "border-[#10b981]/40 text-[#10b981] bg-[#10b981]/10" : "border-red-500/40 text-red-400 bg-red-500/10"}`}>
            {getGameResult(row)}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-end gap-2">
        <div className="text-4xl font-black tabular-nums" style={{ color }}>
          {Number.isFinite(value) ? formatNumber(value, 1) : "S/D"}
        </div>
        <div className="mb-1 rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-widest" style={{ borderColor: `${color}66`, color }}>
          {state === "over" ? "Hit" : state === "under" ? "Miss" : "Push"}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-bold text-[var(--text-muted)]">
        <div className="rounded-lg bg-white/[0.03] px-2 py-1">Línea: <span className="text-white">{Number.isFinite(line) ? line : "S/D"}</span></div>
        <div className="rounded-lg bg-white/[0.03] px-2 py-1">MIN: <span className="text-white">{getMinutes(row)}</span></div>
      </div>

      {Number.isFinite(Number(row._overlayValue)) && row._overlayLabel && (
        <div className="mt-2 rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-cyan-300">
          {row._overlayLabel}: {formatNumber(row._overlayValue, 1)}
        </div>
      )}
    </div>
  );
}

function ValueLabel(props: any) {
  const { x, y, width, value } = props;
  const n = Number(value);

  if (!Number.isFinite(n)) return null;

  return (
    <text
      x={x + width / 2}
      y={y - 8}
      textAnchor="middle"
      fill="var(--text)"
      fontSize={10}
      fontWeight={900}
    >
      {Number.isInteger(n) ? n : n.toFixed(1)}
    </text>
  );
}

function OverlayPointLabel(props: any) {
  const { x, y, value, payload } = props;
  const n = Number(value);
  if (!Number.isFinite(n) || payload?._hideOverlayLabel) return null;
  const label = formatNumber(n, 1);

  return (
    <g>
      <circle cx={x} cy={y - 16} r={11} fill="#020617" stroke={payload?._overlayColor || "#22d3ee"} strokeWidth={1.5} />
      <text
        x={x}
        y={y - 12}
        textAnchor="middle"
        fill={payload?._overlayColor || "#22d3ee"}
        fontSize={8}
        fontWeight={900}
      >
        {label}
      </text>
    </g>
  );
}

export default function PlayerChart({
  data,
  statKey = "value",
  lineValue,
  overlayKey,
  overlayLabel,
  overlayColor = "#22d3ee",
  overlayRatioLabel,
  side = "over",
}: PlayerChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(FALLBACK_WIDTH);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const width = Math.floor(rect.width || el.clientWidth || FALLBACK_WIDTH);
      setChartWidth(Math.max(320, width));
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const chartData = useMemo(() => {
    return Array.isArray(data)
      ? data
          .map((row) => {
            const rawValue = Number(row?.[statKey] ?? row?.value);
            const rawOverlay = overlayKey ? Number(row?.[overlayKey]) : NaN;
            const value = Number.isFinite(rawValue) ? rawValue : 0;
            const result = getGameResult(row);
            const opp = getOpponent(row);

            return {
              ...row,
              value,
              lineValue,
              _chartSide: side,
              _xLabel: `${opp}${result ? ` · ${result}` : ""}`,
              _barState: getBarState(value, lineValue, side),
              _overlayValue: Number.isFinite(rawOverlay) ? rawOverlay : null,
              _overlayLabel: overlayLabel || overlayRatioLabel || overlayKey || "",
              _overlayColor: overlayColor,
              _hideOverlayLabel: false,
            };
          })
          .sort((a, b) => getDateSortValue(a.game_date) - getDateSortValue(b.game_date))
          .map((row, index, arr) => {
            const gameId = row.game_id ?? row.game_key ?? row.game_date ?? "game";
            const dateKey = row.game_date ?? row.date ?? "sin-fecha";
            const uniqueOpponents = new Set(arr.map((r) => getOpponent(r)).filter(Boolean));
            const repeatedOpponentView = uniqueOpponents.size <= 1;
            const result = getGameResult(row);
            const dateLabel = formatDate(row.game_date);
            const opponentLabel = getOpponent(row);
            const compactLabel = repeatedOpponentView
              ? dateLabel
              : `${dateLabel} · ${opponentLabel}${result ? ` ${result}` : ""}`;

            return {
              ...row,
              // Clave única para Recharts. Si filtrás VS OKC, el label OKC se repite muchas veces;
              // usar el rival como dataKey rompe el hover/tooltip y puede mostrar otra fila o 0.
              _xKey: `${dateKey}-${gameId}-${index}`,
              xLabel: compactLabel,
              _xLabel: compactLabel,
              _hideOverlayLabel: arr.length > 30 || (arr.length > 18 && index % 2 !== 0),
            };
          })
      : [];
  }, [data, statKey, lineValue, overlayKey, overlayLabel, overlayRatioLabel, side]);

  const labelByXKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of chartData) {
      map.set(String(row._xKey), String(row._xLabel ?? row.xLabel ?? ""));
    }
    return map;
  }, [chartData]);

  const hasRows = chartData.length > 0;
  const hasRealValues = chartData.some((row) => Number(row.value) > 0);
  const hasOverlay =
    Boolean(overlayKey) &&
    chartData.some((row) => Number.isFinite(Number(row._overlayValue)) && Number(row._overlayValue) > 0);

  if (!hasRows) {
    return (
      <div className="flex h-[470px] w-full min-w-0 items-center justify-center rounded-2xl border border-dashed border-red-500/40 bg-red-500/5 p-6 text-center">
        <div>
          <p className="text-sm font-black uppercase tracking-widest text-red-400">
            Sin datos para graficar
          </p>
          <p className="mt-2 text-xs font-bold text-[var(--text-muted)]">
            El gráfico recibió data vacía.
          </p>
        </div>
      </div>
    );
  }

  if (!hasRealValues) {
    return (
      <div className="flex h-[470px] w-full min-w-0 items-center justify-center rounded-2xl border border-dashed border-yellow-500/40 bg-yellow-500/5 p-6 text-center">
        <div>
          <p className="text-sm font-black uppercase tracking-widest text-yellow-400">
            Hay {chartData.length} partidos, pero la métrica vale 0
          </p>
          <p className="mt-2 text-xs font-bold text-[var(--text-muted)]">
            La columna <code>{statKey}</code> llegó sin valores útiles.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="w-full min-w-0 overflow-hidden relative"
      style={{ height: CHART_HEIGHT, minHeight: CHART_HEIGHT }}
    >
      <ComposedChart
        width={chartWidth}
        height={CHART_HEIGHT}
        data={chartData}
        margin={{ top: 42, right: 34, left: -10, bottom: 62 }}
      >
        <defs>
          <linearGradient id="mp-bar-over" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="1" />
            <stop offset="100%" stopColor="#047857" stopOpacity="0.88" />
          </linearGradient>
          <linearGradient id="mp-bar-under" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fb7185" stopOpacity="1" />
            <stop offset="100%" stopColor="#b91c1c" stopOpacity="0.88" />
          </linearGradient>
          <linearGradient id="mp-bar-push" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="1" />
            <stop offset="100%" stopColor="#b45309" stopOpacity="0.88" />
          </linearGradient>
          <linearGradient id="mp-grid-glow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
            <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.12" />
          </linearGradient>
        </defs>

        <CartesianGrid vertical={false} stroke="url(#mp-grid-glow)" strokeDasharray="4 6" />

        <XAxis
          dataKey="_xKey"
          interval={chartData.length > 14 ? 1 : 0}
          angle={chartData.length > 14 ? -35 : 0}
          textAnchor={chartData.length > 14 ? "end" : "middle"}
          height={chartData.length > 14 ? 74 : 46}
          tickFormatter={(value) => labelByXKey.get(String(value)) ?? ""}
          tick={{ fill: "#67e8f9", fontSize: 10, fontWeight: 900 }}
          axisLine={{ stroke: "rgba(16,185,129,0.35)" }}
          tickLine={false}
        />

        <YAxis
          yAxisId="left"
          tick={{ fill: "#34d399", fontSize: 10, fontWeight: 900 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          domain={[0, "dataMax + 5"]}
        />

        <Tooltip content={<CustomTooltip />} />

        <ReferenceLine
          yAxisId="left"
          y={lineValue}
          stroke="#f8fafc"
          strokeWidth={2.5}
          strokeDasharray="7 5"
          label={{
            value: `Línea ${lineValue}`,
            position: "right",
            fill: "#10b981",
            fontSize: 11,
            fontWeight: 900,
          }}
        />

        <Bar
          yAxisId="left"
          dataKey="value"
          radius={[10, 10, 2, 2]}
          maxBarSize={64}
          minPointSize={4}
          isAnimationActive={false}
        >
          <LabelList content={<ValueLabel />} />
          {chartData.map((row, index) => (
            <Cell
              key={`bar-${row.game_id || row.game_date || index}`}
              fill={row._barState === "over" ? "url(#mp-bar-over)" : row._barState === "under" ? "url(#mp-bar-under)" : "url(#mp-bar-push)"}
              stroke={row._barState === "over" ? "#6ee7b7" : row._barState === "under" ? "#fca5a5" : "#fde68a"}
              strokeWidth={1}
            />
          ))}
        </Bar>

        {hasOverlay && (
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="_overlayValue"
            name={overlayLabel || overlayKey || "Potencial"}
            stroke={overlayColor}
            strokeWidth={2.5}
            strokeDasharray="7 5"
            dot={{ r: 3, strokeWidth: 2, fill: "#050505", stroke: overlayColor }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive={false}
          >
            <LabelList dataKey="_overlayValue" content={<OverlayPointLabel />} />
          </Line>
        )}
      </ComposedChart>
    </div>
  );
}
