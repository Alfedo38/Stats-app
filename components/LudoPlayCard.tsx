"use client";

interface Play {
  player_id: number;
  player: string;
  team: string;
  prop: string;
  type: string;
  line: number;
  odds: number;
  proj: number;
  diff: number;
  edge_score: number;
  edge_pct: number;
  quality: string;
  is_vip: boolean;
  hit_rate: string;  // "4/5 | 8/10"
  analysis: string;
  safe_line?: number;
  safe_odds?: number;
  resultado?: boolean | null;
  book?: string;
  market_type?: string;
}

const QUALITY_EMOJI: Record<string, string> = {
  JOYA: '💎', EXCELENTE: '⭐', BUENA: '🌟', RADAR: '📊',
};

const QUALITY_COLOR: Record<string, string> = {
  JOYA:      'text-yellow-400',
  EXCELENTE: 'text-emerald-400',
  BUENA:     'text-blue-400',
  RADAR:     'text-gray-400',
};

const BETANO_QUALITY_COLOR: Record<string, string> = {
  JOYA:      'text-yellow-400',
  EXCELENTE: 'text-orange-400',
  BUENA:     'text-amber-400',
  RADAR:     'text-gray-400',
};

export default function LudoPlayCard({ play, bookmaker = 'stake' }: { play: Play; bookmaker?: 'stake' | 'betano' }) {
  const isOver = play.type === 'OVER';
  const isBetano = bookmaker === 'betano' || play.book === 'betano' || play.market_type === 'hitos';
  const accentColor = isBetano ? '#f97316' : '#10b981';
  const qualityColor = isBetano ? BETANO_QUALITY_COLOR : QUALITY_COLOR;

  // Separamos hit_rate "4/5 | 8/10" → L5 = "4/5", L10 = "8/10"
  const [hitL5, hitL10] = (play.hit_rate || '').split(' | ');

  // Edge en porcentaje legible
  const edgeDisplay = play.edge_pct != null
    ? `+${Number(play.edge_pct).toFixed(1)}%`
    : play.edge_score != null
    ? `+${Number(play.edge_score).toFixed(2)}`
    : '—';

  // Borde según resultado
  const resultBorder =
    play.resultado === true  ? 'border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.1)]' :
    play.resultado === false ? 'border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.1)]' :
    'border-[var(--border)]';

  const hasSafeOption = play.safe_line != null && play.safe_odds != null && play.safe_odds !== 99;

  return (
    <div className={`flex flex-col xl:flex-row bg-[var(--surface)] border rounded-xl overflow-hidden hover:border-[#444] transition-colors ${resultBorder}`}>

      {/* ── LADO IZQUIERDO: Info + Stats ─────────────────────────────────── */}
      <div className="w-full xl:w-[42%] p-4 border-b xl:border-b-0 xl:border-r border-[var(--border)] flex flex-col justify-between gap-3">

        {/* Fila 1: Jugador + Cuota */}
        <div className="flex justify-between items-start">
          <div>
            {/* Badges */}
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`text-[9px] font-black uppercase tracking-widest ${qualityColor[play.quality] || 'text-gray-400'}`}>
                {QUALITY_EMOJI[play.quality]} {play.quality}
              </span>
              {play.is_vip && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 uppercase tracking-wider">
                  VIP
                </span>
              )}
              {/* Resultado inline */}
              {play.resultado === true  && <span className="text-[9px] font-black text-emerald-400">✓</span>}
              {play.resultado === false && <span className="text-[9px] font-black text-red-400">✗ FALLADO</span>}
            </div>

            {/* Nombre del jugador */}
            <h4 className={`font-bold text-base leading-tight ${play.resultado === false ? 'text-red-400' : 'text-[var(--text)]'}`}>
              {play.player}{' '}
              <span className="text-gray-500 text-xs font-normal">{play.team}</span>
            </h4>

            {/* Tipo de apuesta */}
            <p className={`font-black text-sm uppercase mt-0.5 ${isOver ? 'text-orange-500' : 'text-cyan-500'}`}>
              {play.type} {play.line} {play.prop}
            </p>
          </div>

          {/* Cuota */}
          <div className="text-right shrink-0 ml-2">
            <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-0.5">Cuota</p>
            <p className="text-[var(--text)] font-mono font-bold text-base">{play.odds?.toFixed(2)}</p>
          </div>
        </div>

        {/* Fila 2: Stats rápidas */}
        <div className="grid grid-cols-3 divide-x divide-[#1a1a1a] border-t border-[var(--border)] pt-3">
          <div className="text-center">
            <p className="text-[8px] text-gray-500 uppercase tracking-widest mb-1">Proy IA</p>
            <p className="text-[var(--text)] font-bold text-sm">{play.proj?.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-[8px] text-gray-500 uppercase tracking-widest mb-1">Edge</p>
            <p
              className="font-bold text-sm"
              style={{ color: Number(play.edge_pct) > 20 ? accentColor : '#eab308' }}
            >
              {edgeDisplay}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[8px] text-gray-500 uppercase tracking-widest mb-1">
              {hitL10 ? 'Acierto L5' : 'Hit Rate'}
            </p>
            <p className="text-[var(--text)] font-bold text-sm">
              {hitL5 || play.hit_rate || '—'}
            </p>
          </div>
        </div>

      </div>

      {/* ── LADO DERECHO: Scouting AI ─────────────────────────────────────── */}
      <div className="w-full xl:w-[58%] p-4 flex flex-col justify-center bg-[var(--surface-soft)] gap-3">

        {/* Scouting AI */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm">🤖</span>
            <h5 className="text-[9px] font-black uppercase tracking-widest" style={{ color: accentColor }}>Scouting AI</h5>
            {/* L10 si existe */}
            {hitL10 && (
              <span className="ml-auto text-[8px] text-[var(--text-muted)] font-black uppercase">
                L10: <span className="text-[var(--text-muted)]">{hitL10}</span>
              </span>
            )}
          </div>

          <p className="text-[#aaa] text-xs leading-relaxed font-mono">
            {play.analysis
              ? play.analysis.replace(/^\S+\s*\[.*?\]\s*/, '').trim()  // Quitamos el prefijo emoji + [CALIDAD]
              : `Proyección de ${play.proj?.toFixed(1)} ${play.prop}. Evaluado por el modelo Ludo.`
            }
          </p>
        </div>

        {/* Opción segura */}
        {hasSafeOption && (
          <div
            className="inline-flex items-center gap-3 border px-3 py-1.5 rounded-lg w-fit"
            style={{ background: `${accentColor}18`, borderColor: `${accentColor}35` }}
          >
            <span className="text-xs">🛡️</span>
            <p className="text-[10px] text-[var(--text)] font-bold uppercase">
              Seguro:{' '}
              <span className={`${isOver ? 'text-orange-400' : 'text-cyan-400'}`}>
                {play.type} {play.safe_line} {play.prop}
              </span>
            </p>
            <span
              className="text-[10px] text-gray-400 font-mono border-l pl-3"
              style={{ borderLeftColor: `${accentColor}55` }}
            >
              Cuota {play.safe_odds?.toFixed(2)}
            </span>
          </div>
        )}

      </div>

    </div>
  );
}