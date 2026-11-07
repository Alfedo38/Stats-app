// components/GameCarousel.tsx — VERSIÓN FINAL (sin logos ni imágenes)
"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Radio } from "lucide-react";
import { getTeamColor } from "@/lib/teamColors";
import {jornadaDateAllowed,type JornadaGame} from "@/lib/nbaJornada";
import { argentinaDate, canonicalTeam } from "@/lib/matchupFilters";
import { carouselArrows, gameCardStatus } from "@/lib/gameCardStatus";

function formatArgTime(dateStr: string): string {
  return new Date(dateStr)
    .toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })
    .replace(/[\u00A0\u202F]/g, " ");
}

function TeamBlock({ abbr, score, isLive }: { abbr: string; score?: string; isLive: boolean }) {
  const color = getTeamColor(abbr);
  return (
    <div className="flex items-center justify-between gap-3 w-full rounded-xl p-1 -m-1 transition hover:bg-white/[0.04]">
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Avatar con color del equipo en lugar de logo */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border font-black text-xs tracking-tighter"
          style={{ background: `${color}18`, borderColor: `${color}35`, color }}
        >
          {abbr.slice(0, 3)}
        </div>
        <span className="text-sm font-black uppercase tracking-tight text-[var(--text)] truncate">
          {abbr}
        </span>
      </div>
      {isLive && score !== undefined && (
        <span className={`text-xl font-black tabular-nums shrink-0 ${isLive ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
          {score || "-"}
        </span>
      )}
    </div>
  );
}

function GameCard({ game, event, showPlayerLinks, slateDate, state }: { game: any; event: JornadaGame & {date:string};showPlayerLinks:boolean;slateDate?:string;state:ReturnType<typeof gameCardStatus> }) {
  const comp  = game.competitions?.[0];
  const home  = comp?.competitors?.find((c: any) => c.homeAway === "home");
  const away  = comp?.competitors?.find((c: any) => c.homeAway === "away");
  const isLive = state === "live";
  const isFinal = state === "final";
  const scoreVerified = game.status?.type?.state === (isFinal ? "post" : "in");

  if (!home || !away) return null;

  const context=new URLSearchParams({date:event.date});
  if(event.start)context.set("start",event.start);
  const href = `/partidos/${event.away}-${event.home}?${context}`;
  const playersHref=`/trending?${new URLSearchParams({date:slateDate??event.date,game:event.id,...(slateDate?{slate:"nba"}:{})})}`;
  const homeAbbr = canonicalTeam(home.team?.abbreviation);
  const awayAbbr = canonicalTeam(away.team?.abbreviation);
  const homeColor = getTeamColor(homeAbbr);
  const awayColor = getTeamColor(awayAbbr);

  // Odds from nested structure if ESPN provides it
  const odds = !isFinal ? comp?.odds?.[0] : undefined;
  const spread = typeof odds?.details==="string"&&/^[A-Z]{2,3}\s*[+-]\d/.test(odds.details)?odds.details:null;
  const total  = odds?.overUnder != null ? `O/U ${odds.overUnder}` : null;

  // Quarter/period detail
  const detail = game.status?.type?.state==="in"?game.status.type.shortDetail??"En juego":"En juego";

  return (
    <article className="min-w-[260px] sm:min-w-[290px] snap-center bg-[var(--surface)] border border-[var(--border)] rounded-3xl overflow-hidden shadow-xl flex flex-col hover:border-[var(--border-strong)] transition-colors group relative">

      {/* Fondo decorativo: nombre del partido como watermark */}
      <span
        className="absolute right-2 bottom-6 font-black italic text-[56px] leading-none select-none pointer-events-none uppercase tracking-tighter opacity-[0.035] text-[var(--text)]"
        aria-hidden="true"
      >
        {awayAbbr}
      </span>

      {/* Status bar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]"
        style={{
          background: isLive
            ? "rgba(239,68,68,0.08)"
            : isFinal
            ? "rgba(107,114,128,0.08)"
            : `${homeColor}08`,
        }}
      >
        <span className="text-[8px] font-black uppercase tracking-[0.25em] text-[var(--text-muted)]">
          {isLive?"En juego":isFinal?"Finalizado":state==="scheduled"?"Programado":"Estado sin confirmar"}
        </span>
        <div className="flex items-center gap-1.5">
          {isLive && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          )}
          <span
            suppressHydrationWarning
            className={`text-[9px] font-black px-2 py-0.5 rounded-md ${
              isLive
                ? "bg-red-500/15 text-red-400"
                : isFinal
                ? "bg-[var(--surface-soft)] text-[var(--text-muted)]"
                : "bg-[var(--surface-soft)] text-[var(--text-muted)]"
            }`}
          >
            {isLive ? detail : isFinal ? "Final" : !event.start ? "Horario S/D" : `${new Intl.DateTimeFormat("es-AR",{day:"2-digit",month:"2-digit",timeZone:"America/Argentina/Buenos_Aires"}).format(new Date(game.date))} · ${formatArgTime(game.date)}`}
          </span>
        </div>
      </div>

      {/* Teams + scores */}
      <div className="px-4 py-4 flex flex-col gap-3 flex-1 relative z-10">
        <TeamBlock abbr={awayAbbr} score={scoreVerified?away.score:undefined} isLive={isLive || isFinal} />
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${awayColor}40, ${homeColor}40)` }} />
          <span className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest shrink-0">vs</span>
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${homeColor}40, transparent)` }} />
        </div>
        <TeamBlock abbr={homeAbbr} score={scoreVerified?home.score:undefined} isLive={isLive || isFinal} />
      </div>

      {/* Odds footer */}
      {(spread || total) && (
        <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--border)] bg-[var(--bg)]">
          {spread && (
            <span className="text-[8px] font-black text-[var(--text-muted)] tabular-nums">
              <span className="text-[var(--text-soft)]">Spread</span> {spread}
            </span>
          )}
          {spread && total && <span className="text-[var(--border)] text-xs">·</span>}
          {total && (
            <span className="text-[8px] font-black text-[var(--text-muted)] tabular-nums">
              {total}
            </span>
          )}
        </div>
      )}
      <div className="relative z-10 flex flex-wrap items-center gap-2 border-t border-[var(--border)] p-3 text-xs font-bold">{showPlayerLinks&&<Link href={playersHref} className="rounded-lg bg-[#10b981] px-3 py-2 text-[#062019]">Ver jugadores →</Link>}<Link href={href} className="rounded-lg px-2 py-2 text-[var(--text-muted)] hover:text-[var(--text)]">Comparar equipos</Link></div>
    </article>
  );
}

export default function GameCarousel({ games, schedule, date, updatedAt, showPlayerLinks=jornadaDateAllowed(date),nbaSlate=false,partial=false,checkedAt }: { games: any[]; schedule: JornadaGame[]|null; date:string; updatedAt?: string;showPlayerLinks?:boolean;nbaSlate?:boolean;partial?:boolean;checkedAt:number }) {
  const teamFor=(game:any,side:string)=>canonicalTeam(game.competitions?.[0]?.competitors?.find((c:any)=>c.homeAway===side)?.team?.abbreviation);
  const official=schedule??[];
  const rows=official.map(event=>{
    const eventDate=event.eventDate??date;
    const matching=games.filter(game=>argentinaDate(game.date)===eventDate&&teamFor(game,"away")===event.away&&teamFor(game,"home")===event.home);
    const feed=matching.length===1?matching[0]:null;
    const game={...(feed??{}),date:event.start,competitions:feed?.competitions??[{competitors:[{homeAway:"away",team:{abbreviation:event.away}},{homeAway:"home",team:{abbreviation:event.home}}]}]};
    return {event:{...event,date:eventDate},game,state:gameCardStatus(event.status,feed?.status?.type?.state,event.start,checkedAt)};
  });
  const finals=rows.filter(row=>row.state==="final").length;
  const unknown = rows.filter(row=>row.state==="unknown").length;
  const ref = useRef<HTMLDivElement>(null);
  const [arrows,setArrows]=useState({previous:false,next:false});
  const checkScroll=()=>{
    const rail=ref.current;
    if(rail)setArrows(carouselArrows(rail.clientWidth,rail.scrollWidth,rail.scrollLeft));
  };
  useEffect(()=>{
    const rail=ref.current;
    if(!rail)return;
    checkScroll();
    const observer=new ResizeObserver(checkScroll);
    observer.observe(rail);
    for(const card of rail.children)observer.observe(card);
    return ()=>observer.disconnect();
  },[date,rows.length]);

  const scroll = (dir: "left" | "right") => {
    if (!ref.current) return;
    const w = ref.current.clientWidth;
    ref.current.scrollTo({ left: ref.current.scrollLeft + (dir === "left" ? -w : w), behavior: "smooth" });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div>
          <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] flex items-center gap-2">
            <Radio size={13} className="text-red-400" />
            {nbaSlate?"Jornada NBA · Hora ARG":"Cartelera · Hora ARG"}
          </h3>
          {official.length>0&&<p className="mt-1 text-xs text-[var(--text-muted)]">{finals===official.length?"Todos los partidos finalizaron":`${official.length} partidos · ${finals} finalizados${unknown?` · ${unknown} con estado sin confirmar`:""}`}</p>}
          {nbaSlate&&<p className="mt-1 text-xs text-[var(--text-muted)]">{rows.filter(r=>r.event.date!==date).length} en la madrugada siguiente{partial?" · madrugada sin verificar":""}</p>}
          {!nbaSlate&&updatedAt && <p className="mt-1 text-xs text-[var(--text-muted)]">Actualizado {updatedAt}</p>}
        </div>
        {(arrows.previous || arrows.next) && (
          <div className="flex gap-1.5">
            {(["left","right"] as const).map(d => (
              <button
                key={d}
                aria-label={d==="left"?"Partidos anteriores":"Más partidos"}
                type="button"
                disabled={d==="left"?!arrows.previous:!arrows.next}
                onClick={() => scroll(d)}
                className="grid h-9 w-9 place-items-center bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-soft)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] transition-all disabled:opacity-40 disabled:cursor-default"
              >
                {d === "left" ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        ref={ref}
        onScroll={checkScroll}
        className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] snap-x snap-mandatory"
      >
        {rows.length > 0 ? (
          rows.map(({event,game,state}) => <GameCard key={event.id} event={event} game={game} state={state} showPlayerLinks={showPlayerLinks} slateDate={nbaSlate?date:undefined} />)
        ) : (
          <div className="w-full bg-[var(--surface)] border border-dashed border-[var(--border)] p-10 rounded-3xl text-center">
            <p className="text-[var(--text-muted)] text-[10px] font-black uppercase tracking-widest">
              {schedule===null?"Calendario no disponible · volvé a intentar":"No hay partidos en el calendario para esta fecha"}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
