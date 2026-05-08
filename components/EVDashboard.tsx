"use client";
import { useState, useMemo, useEffect, useCallback } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Calendar, ChevronLeft, ChevronRight, X, Zap } from 'lucide-react';
import LudoPlayCard from './LudoPlayCard';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TabType    = 'AYER' | 'HOY' | 'MANANA' | 'CALENDAR';
type Side       = 'OVER' | 'UNDER';
type Family     = string; // flexible: MAIN, TECH, Q1, COMBO, SPEC, etc.
type Bookmaker  = 'stake' | 'betano';

interface Play {
  player_id: number;
  player: string;
  team: string;
  prop: string;
  type: string;
  family: string;
  line: number;
  linea_raw?: string;
  threshold?: number;
  odds: number;
  proj: number;
  diff: number;
  edge_score: number;
  edge_pct: number;
  prob_model?: number;
  quality: string;
  is_vip: boolean;
  hit_rate: string;
  analysis: string;
  safe_line?: number;
  safe_odds?: number;
  resultado?: boolean | null;
}

interface Ticket {
  name: string;
  side: Side;
  family: Family;
  total_odds: number;
  plays: Play[];
}

interface Block {
  matchup: string;
  game_date: string;
  guion: string;
  tickets: Ticket[];
}

interface CalendarEntry {
  date: string;
  status: 'PENDING' | 'SETTLED' | 'PARTIAL';
}

interface EVDashboardProps {
  yesterday:  Block[] | null;
  today:      Block[] | null;
  tomorrow:   Block[] | null;
  dates: {
    yesterdayStr: string;
    todayStr:     string;
    tomorrowStr:  string;
  };
  bookmaker?: Bookmaker;
}

// ─── Config por bookmaker ─────────────────────────────────────────────────────

const FAMILY_CONFIG: Record<Bookmaker, Record<string, string>> = {
  stake: {
    MAIN: '🏀 Full Game',
    TECH: '🎯 Técnicos',
    Q1:   '⏱️ 1Q',
  },
  betano: {
    MAIN:  '🎯 Principales',
    COMBO: '🔗 Combinados',
    SPEC:  '💥 Especiales',
  },
};

const BANNER_CONFIG: Record<Bookmaker, { emoji: string; name: string; desc: string }> = {
  stake: {
    emoji: '🟢',
    name: 'Cerebro EV+ · Stake',
    desc: 'Ludo evalúa props de jugadores y detecta valor matemático en las líneas de Stake. Cada ticket combina picks validados por hit rate histórico.',
  },
  betano: {
    emoji: '🔵',
    name: 'Cerebro EV+ · Betano',
    desc: 'Ludo evalúa hitos de Betano (24+, 8+, etc.) y calcula la probabilidad real de superarlos. Cada pick tiene EV positivo sobre la cuota de mercado.',
  },
};

const MONTHS_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const STATUS_DOT: Record<string, string> = {
  SETTLED: 'bg-emerald-500',
  PARTIAL: 'bg-yellow-500',
  PENDING: 'bg-[#10b981]',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTicketResult(plays: Play[]): 'won' | 'lost' | 'pending' {
  const withResult = plays.filter(p => p.resultado !== null && p.resultado !== undefined);
  if (withResult.length === 0) return 'pending';
  if (withResult.every(p => p.resultado === true)) return 'won';
  if (withResult.some(p => p.resultado === false)) return 'lost';
  return 'pending';
}

function shortMatchup(matchup: string): string {
  const parts = matchup.split(' @ ');
  if (parts.length !== 2) return matchup;
  return `${parts[0].split(' ').slice(-1)[0]} @ ${parts[1].split(' ').slice(-1)[0]}`;
}

function formatTabDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

// ─── Mini Calendario ─────────────────────────────────────────────────────────

function MiniCalendar({
  availableDates, selectedDate, todayStr, onSelect, onClose,
}: {
  availableDates: CalendarEntry[];
  selectedDate: string | null;
  todayStr: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const now   = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const datesMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of availableDates) m[e.date] = e.status;
    return m;
  }, [availableDates]);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1); };

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const startOffset    = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  const daysInMonth    = new Date(year, month + 1, 0).getDate();

  return (
    <div className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-4 shadow-[0_20px_60px_rgba(0,0,0,0.95)] w-[280px]">
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-1 text-[#666] hover:text-white transition-colors"><ChevronLeft size={15}/></button>
        <span className="text-xs font-black uppercase tracking-widest text-white">{MONTHS_ES[month]} {year}</span>
        <button onClick={nextMonth} className="p-1 text-[#666] hover:text-white transition-colors"><ChevronRight size={15}/></button>
        <button onClick={onClose} className="p-1 text-[#444] hover:text-white transition-colors ml-1"><X size={13}/></button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {['L','M','Mi','J','V','S','D'].map(d => (
          <div key={d} className="text-center text-[9px] font-black text-[#444] py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {Array.from({ length: startOffset }).map((_, i) => <div key={`e-${i}`}/>)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day     = i + 1;
          const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const status  = datesMap[dateStr];
          const isToday    = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const hasData    = !!status;

          return (
            <button
              key={day}
              onClick={() => hasData && onSelect(dateStr)}
              disabled={!hasData}
              className={`relative flex flex-col items-center justify-center h-8 rounded-lg text-[11px] font-black transition-all ${
                isSelected   ? 'bg-[#10b981] text-black' :
                isToday      ? 'border border-[#10b981]/40 text-[#10b981]' :
                hasData      ? 'text-white hover:bg-[#1a1a1a] cursor-pointer' :
                               'text-[#2a2a2a] cursor-default'
              }`}
            >
              {day}
              {hasData && !isSelected && (
                <span className={`absolute bottom-0.5 w-1 h-1 rounded-full ${STATUS_DOT[status] || 'bg-[#10b981]'}`}/>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-[#1a1a1a]">
        {[['bg-emerald-500','Verificado'],['bg-[#10b981]','Pendiente'],['bg-yellow-500','Parcial']].map(([color, label]) => (
          <div key={label} className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${color}`}/>
            <span className="text-[8px] text-[#444] font-black uppercase">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TicketCard ───────────────────────────────────────────────────────────────

function TicketCard({ ticket }: { ticket: Ticket }) {
  const [expanded, setExpanded] = useState(true);
  const result      = getTicketResult(ticket.plays);
  const failedPlays = ticket.plays.filter(p => p.resultado === false);

  const borderClass =
    result === 'won'  ? 'border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.08)]' :
    result === 'lost' ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.08)]' :
    'border-[#1a1a1a]';

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all bg-[#0a0a0a] ${borderClass}`}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-[#111] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {result === 'won'     && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_6px_rgba(16,185,129,0.8)]"/>}
          {result === 'lost'    && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.8)]"/>}
          {result === 'pending' && <span className="w-2 h-2 rounded-full bg-[#333] shrink-0"/>}
          <span className="text-white font-black text-xs uppercase tracking-tight truncate">{ticket.name}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          <span className={`text-xs font-black px-2 py-1 rounded-lg ${
            result === 'won'  ? 'bg-emerald-500/20 text-emerald-400' :
            result === 'lost' ? 'bg-red-500/20 text-red-400' :
            'bg-[#10b981]/20 text-[#10b981]'
          }`}>
            {ticket.total_odds?.toFixed(2)}x
          </span>
          {result === 'won'  && <span className="text-[9px] font-black text-emerald-400 hidden md:block">✓ Ganado</span>}
          {result === 'lost' && <span className="text-[9px] font-black text-red-400 hidden md:block">✗ {failedPlays.length} fall{failedPlays.length === 1 ? 'ó':'aron'}</span>}
          {expanded ? <ChevronUp size={14} className="text-[#444]"/> : <ChevronDown size={14} className="text-[#444]"/>}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-2">
          {failedPlays.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-1">
              <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-1">✗ Líneas que fallaron:</p>
              {failedPlays.map((p, i) => (
                <p key={i} className="text-[10px] text-red-300 font-bold">
                  {p.player} — {p.type} {p.linea_raw || p.line} {p.prop}
                </p>
              ))}
            </div>
          )}
          {ticket.plays.map((play, i) => <LudoPlayCard key={i} play={play}/>)}
        </div>
      )}
    </div>
  );
}

// ─── EVDashboard ──────────────────────────────────────────────────────────────

export default function EVDashboard({
  yesterday, today, tomorrow, dates, bookmaker = 'stake',
}: EVDashboardProps) {

  const familyLabels = FAMILY_CONFIG[bookmaker];
  const banner       = BANNER_CONFIG[bookmaker];
  const accentColor  = bookmaker === 'betano' ? '#2563eb' : '#10b981';

  const defaultTab: TabType = today ? 'HOY' : yesterday ? 'AYER' : 'MANANA';
  const [activeTab,    setActiveTab]    = useState<TabType>(defaultTab);
  const [activeGame,   setActiveGame]   = useState<string>('');
  const [activeSide,   setActiveSide]   = useState<Side>('OVER');
  const [activeFamily, setActiveFamily] = useState<Family>('MAIN');

  const [calendarOpen,    setCalendarOpen]    = useState(false);
  const [calendarEntries, setCalendarEntries] = useState<CalendarEntry[]>([]);
  const [calendarDate,    setCalendarDate]    = useState<string | null>(null);
  const [calendarBlocks,  setCalendarBlocks]  = useState<Block[] | null>(null);
  const [loadingCal,      setLoadingCal]      = useState(false);

  // Reset al cambiar de bookmaker
  useEffect(() => {
    setActiveTab(today ? 'HOY' : yesterday ? 'AYER' : 'MANANA');
    setCalendarDate(null);
    setCalendarBlocks(null);
    setCalendarEntries([]);
  }, [bookmaker]);

  useEffect(() => {
    if (!calendarOpen || calendarEntries.length > 0) return;
    const endpoint = bookmaker === 'betano'
      ? '/api/ludo-calendar?book=betano'
      : '/api/ludo-calendar';
    fetch(endpoint).then(r => r.json()).then(setCalendarEntries).catch(() => {});
  }, [calendarOpen, bookmaker]);

  const handleCalendarSelect = useCallback(async (date: string) => {
    if (date === dates.yesterdayStr) { setActiveTab('AYER');   setCalendarDate(null); setCalendarOpen(false); return; }
    if (date === dates.todayStr)     { setActiveTab('HOY');    setCalendarDate(null); setCalendarOpen(false); return; }
    if (date === dates.tomorrowStr)  { setActiveTab('MANANA'); setCalendarDate(null); setCalendarOpen(false); return; }

    setLoadingCal(true);
    setCalendarOpen(false);
    try {
      const bookParam = bookmaker === 'betano' ? '&book=betano' : '';
      const res  = await fetch(`/api/ludo-picks?date=${date}${bookParam}`);
      const data = await res.json();
      setCalendarBlocks(data?.blocks?.filter((b: Block) => !b.matchup?.startsWith('🌎')) || null);
      setCalendarDate(date);
      setActiveTab('CALENDAR');
    } catch {
      setCalendarBlocks(null);
    } finally {
      setLoadingCal(false);
    }
  }, [dates, bookmaker]);

  const currentBlocks = useMemo((): Block[] => {
    if (activeTab === 'CALENDAR') return calendarBlocks || [];
    if (activeTab === 'AYER')     return yesterday || [];
    if (activeTab === 'HOY')      return today     || [];
    if (activeTab === 'MANANA')   return tomorrow  || [];
    return [];
  }, [activeTab, calendarBlocks, yesterday, today, tomorrow]);

  const gamesForTab = useMemo(() =>
    [...new Set(currentBlocks.map(b => b.matchup))],
    [currentBlocks]
  );

  const allTicketsForGame = useMemo(() =>
    currentBlocks.filter(b => b.matchup === activeGame).flatMap(b => b.tickets),
    [currentBlocks, activeGame]
  );

  // Betano siempre es OVER — ocultamos el selector si no hay UNDER
  const availableSides = useMemo(() => {
    const sides = new Set(allTicketsForGame.map(t => t.side));
    return (['OVER', 'UNDER'] as Side[]).filter(s => sides.has(s));
  }, [allTicketsForGame]);

  const ticketsForSide = useMemo(() =>
    allTicketsForGame.filter(t => t.side === activeSide),
    [allTicketsForGame, activeSide]
  );

  const availableFamilies = useMemo(() =>
    Object.keys(familyLabels).filter(f => ticketsForSide.some(t => t.family === f)),
    [ticketsForSide, familyLabels]
  );

  const visibleTickets = useMemo(() =>
    ticketsForSide.filter(t => t.family === activeFamily),
    [ticketsForSide, activeFamily]
  );

  useEffect(() => {
    setActiveGame(gamesForTab.length > 0 ? gamesForTab[0] : '');
  }, [activeTab, calendarDate]);

  useEffect(() => {
    if (availableFamilies.length > 0 && !availableFamilies.includes(activeFamily)) {
      setActiveFamily(availableFamilies[0]);
    }
  }, [availableFamilies]);

  // Auto-seleccionar el único side disponible (Betano solo tiene OVER)
  useEffect(() => {
    if (availableSides.length === 1) setActiveSide(availableSides[0]);
  }, [availableSides]);

  if (!yesterday && !today && !tomorrow) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl">
        <AlertCircle size={40} className="text-[#444] mb-4"/>
        <p className="text-[#666] font-bold uppercase tracking-widest text-sm">
          No hay picks de {bookmaker === 'betano' ? 'Betano' : 'Stake'} disponibles.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">

      {/* ── BANNER ─────────────────────────────────────────────────────────── */}
      <div
        className="border rounded-2xl p-5 flex items-start gap-4"
        style={{ background: `${accentColor}08`, borderColor: `${accentColor}20` }}
      >
        <div
          className="p-3 rounded-xl shrink-0 mt-0.5"
          style={{ background: `${accentColor}15` }}
        >
          <Zap size={18} style={{ color: accentColor }}/>
        </div>
        <div>
          <h3 className="text-white font-black uppercase text-sm mb-1">
            {banner.emoji} {banner.name}
          </h3>
          <p className="text-[#666] text-xs leading-relaxed">
            {banner.desc}{' '}
            <strong style={{ color: accentColor }}>Verde</strong> = ganado ·{' '}
            <strong className="text-red-400">Rojo</strong> = fallado ·{' '}
            <span className="text-[#555]">Gris</span> = pendiente.
          </p>
        </div>
      </div>

      {/* ── TABS + HISTORIAL ─────────────────────────────────────────────── */}
      <div className="flex items-end justify-between border-b border-[#222] pb-0">
        <div className="flex gap-0">
          {yesterday && (
            <button
              onClick={() => { setActiveTab('AYER'); setCalendarDate(null); }}
              className={`pb-3 px-4 text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'AYER'
                  ? `border-b-2 text-[${accentColor}]`
                  : 'text-[#555] hover:text-[#aaa]'
              }`}
              style={activeTab === 'AYER' ? { color: accentColor, borderBottomColor: accentColor } : {}}
            >
              Ayer
              <span className="ml-1.5 text-[9px] opacity-50 font-bold normal-case">
                {formatTabDate(dates.yesterdayStr)}
              </span>
            </button>
          )}

          <button
            onClick={() => { setActiveTab('HOY'); setCalendarDate(null); }}
            className="pb-3 px-4 text-xs font-black uppercase tracking-widest transition-all"
            style={activeTab === 'HOY'
              ? { color: accentColor, borderBottom: `2px solid ${accentColor}` }
              : { color: '#555' }
            }
          >
            Hoy
            <span className="ml-1.5 text-[9px] opacity-50 font-bold normal-case">
              {formatTabDate(dates.todayStr)}
            </span>
          </button>

          {tomorrow && (
            <button
              onClick={() => { setActiveTab('MANANA'); setCalendarDate(null); }}
              className="pb-3 px-4 text-xs font-black uppercase tracking-widest transition-all"
              style={activeTab === 'MANANA'
                ? { color: '#a855f7', borderBottom: '2px solid #a855f7' }
                : { color: '#555' }
              }
            >
              Mañana
              <span className="ml-1.5 text-[9px] opacity-50 font-bold normal-case">
                {formatTabDate(dates.tomorrowStr)}
              </span>
            </button>
          )}

          {activeTab === 'CALENDAR' && calendarDate && (
            <button
              className="pb-3 px-4 text-xs font-black uppercase tracking-widest text-orange-400 border-b-2 border-orange-400"
            >
              📅 {formatTabDate(calendarDate)}
            </button>
          )}
        </div>

        {/* Botón historial */}
        <div className="relative pb-3">
          <button
            onClick={() => setCalendarOpen(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
              calendarOpen
                ? 'bg-[#111] text-white border-[#333]'
                : 'bg-[#0a0a0a] border-[#222] text-[#555] hover:text-white hover:border-[#333]'
            }`}
          >
            <Calendar size={13}/> Historial
          </button>

          {calendarOpen && (
            <div className="absolute right-0 top-full mt-2 z-50">
              <MiniCalendar
                availableDates={calendarEntries}
                selectedDate={calendarDate}
                todayStr={dates.todayStr}
                onSelect={handleCalendarSelect}
                onClose={() => setCalendarOpen(false)}
              />
            </div>
          )}
        </div>
      </div>

      {loadingCal && (
        <div className="text-center py-8">
          <p className="text-xs font-black uppercase tracking-widest animate-pulse" style={{ color: accentColor }}>
            Cargando picks históricos...
          </p>
        </div>
      )}

      {/* ── LAYOUT ───────────────────────────────────────────────────────── */}
      {!loadingCal && (
        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* MENÚ IZQUIERDO */}
          <div className="w-full lg:w-[260px] shrink-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-[#444] mb-3 px-1">
              {gamesForTab.length} partido{gamesForTab.length !== 1 ? 's' : ''}
            </p>
            <div className="flex flex-col gap-2">
              {gamesForTab.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-[#222] rounded-2xl">
                  <p className="text-[#444] text-xs font-bold uppercase tracking-widest">Sin picks para esta fecha</p>
                </div>
              ) : gamesForTab.map(game => {
                const isSelected  = activeGame === game;
                const ticketCount = currentBlocks.filter(b => b.matchup === game).flatMap(b => b.tickets).length;
                const allPlays    = currentBlocks.filter(b => b.matchup === game).flatMap(b => b.tickets).flatMap(t => t.plays);
                const gameResult  = getTicketResult(allPlays);

                return (
                  <button
                    key={game}
                    onClick={() => setActiveGame(game)}
                    className="w-full text-left px-4 py-3 rounded-xl border transition-all"
                    style={isSelected
                      ? { background: '#111', borderColor: `${accentColor}50` }
                      : { background: '#0a0a0a', borderColor: '#1a1a1a' }
                    }
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      {gameResult === 'won'  && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"/>}
                      {gameResult === 'lost' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"/>}
                      <p className={`font-black text-xs uppercase tracking-tight leading-tight`}
                         style={{ color: isSelected ? accentColor : 'white' }}>
                        {shortMatchup(game)}
                      </p>
                    </div>
                    <p className="text-[9px] text-[#444] font-bold truncate">{game}</p>
                    <p className="text-[8px] text-[#333] font-black uppercase tracking-widest mt-1">
                      {ticketCount} {ticketCount === 1 ? 'pick' : 'picks'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PANEL DERECHO */}
          <div className="flex-1 min-w-0">
            {activeGame ? (
              <div className="flex flex-col gap-5">
                <h2 className="text-2xl font-black uppercase tracking-tighter text-white leading-tight">
                  {activeGame}
                </h2>

                {/* OVER / UNDER — solo si hay ambos (Betano siempre es OVER) */}
                {availableSides.length > 1 && (
                  <div className="flex bg-[#111] p-1 rounded-xl border border-[#222] w-fit">
                    {availableSides.map(side => {
                      const count = allTicketsForGame.filter(t => t.side === side).length;
                      return (
                        <button
                          key={side}
                          onClick={() => setActiveSide(side)}
                          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                            activeSide === side
                              ? side === 'OVER'
                                ? 'bg-orange-500 text-white shadow-[0_0_10px_rgba(249,115,22,0.3)]'
                                : 'bg-cyan-500 text-white shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                              : 'text-[#555] hover:text-white'
                          }`}
                        >
                          {side === 'OVER' ? '🔥' : '🧊'} {side}
                          <span className="opacity-60 text-[9px]">({count})</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* FAMILIA */}
                {availableFamilies.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {availableFamilies.map(family => {
                      const count = ticketsForSide.filter(t => t.family === family).length;
                      return (
                        <button
                          key={family}
                          onClick={() => setActiveFamily(family)}
                          className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border"
                          style={activeFamily === family
                            ? { background: '#1a1a1a', color: 'white', borderColor: '#444' }
                            : { background: '#0a0a0a', color: '#555', borderColor: '#1a1a1a' }
                          }
                        >
                          {familyLabels[family] || family}
                          <span className="ml-1 opacity-50 text-[9px]">({count})</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* TICKETS */}
                {visibleTickets.length === 0 ? (
                  <div className="border border-dashed border-[#222] rounded-2xl p-10 text-center">
                    <p className="text-[#444] text-xs font-black uppercase tracking-widest">
                      Sin picks disponibles
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {visibleTickets.map((ticket, idx) => (
                      <TicketCard key={idx} ticket={ticket}/>
                    ))}
                  </div>
                )}

              </div>
            ) : (
              <div className="border border-dashed border-[#1a1a1a] rounded-2xl p-12 text-center">
                <p className="text-[#444] text-xs font-black uppercase tracking-widest">
                  Seleccioná un partido para ver los picks
                </p>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}