"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TeamLogo } from "./NbaMedia";
import {jornadaDateAllowed,type JornadaGame} from "@/lib/nbaJornada";
import { argentinaDate, canonicalTeam } from "@/lib/matchupFilters";
import { carouselArrows, gameCardStatus } from "@/lib/gameCardStatus";

function formatArgTime(dateStr: string): string {
  return new Date(dateStr)
    .toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })
    .replace(/[\u00A0\u202F]/g, " ");
}

function TeamBlock({ abbr, score, isLive }: { abbr: string; score?: string; isLive: boolean }) {
  return <div className="mosk-match-team">
    <TeamLogo team={abbr} size={30} />
    <strong>{abbr}</strong>
    {isLive && score !== undefined && <span>{score || "–"}</span>}
  </div>;
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

  // Odds from nested structure if ESPN provides it
  const odds = !isFinal ? comp?.odds?.[0] : undefined;
  const spread = typeof odds?.details==="string"&&/^[A-Z]{2,3}\s*[+-]\d/.test(odds.details)?odds.details:null;
  const total  = odds?.overUnder != null ? `O/U ${odds.overUnder}` : null;

  // Quarter/period detail
  const detail = game.status?.type?.state==="in"?game.status.type.shortDetail??"En juego":"En juego";

  return (
    <article className="mosk-match-card snap-center">
      <header className="mosk-match-meta">
        <span suppressHydrationWarning>
          {isLive ? detail : isFinal ? "Finalizado" : !event.start ? "Horario sin confirmar" : `${new Intl.DateTimeFormat("es-AR",{day:"2-digit",month:"2-digit",timeZone:"America/Argentina/Buenos_Aires"}).format(new Date(game.date))} · ${formatArgTime(game.date)}`}
        </span>
        {state==="unknown"&&event.start&&<span>Estado sin confirmar</span>}
      </header>
      <div className="mosk-match-teams">
        <TeamBlock abbr={awayAbbr} score={scoreVerified?away.score:undefined} isLive={isLive || isFinal} />
        <TeamBlock abbr={homeAbbr} score={scoreVerified?home.score:undefined} isLive={isLive || isFinal} />
      </div>
      {/* Odds footer */}
      {(spread || total) && (
        <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--border)] bg-[var(--bg)]">
          {spread && (
            <span className="text-xs font-semibold text-[var(--text-muted)] tabular-nums">
              <span className="text-[var(--text-soft)]">Spread</span> {spread}
            </span>
          )}
          {spread && total && <span className="text-[var(--border)] text-xs">·</span>}
          {total && (
            <span className="text-xs font-semibold text-[var(--text-muted)] tabular-nums">
              {total}
            </span>
          )}
        </div>
      )}
      <div className="mosk-match-actions">{showPlayerLinks&&<Link href={playersHref} className="mosk-primary">Ver jugadores →</Link>}<Link href={href} className="rounded-lg px-2 py-2 text-[var(--text-muted)] hover:text-[var(--text)]">Comparar equipos</Link></div>
    </article>
  );
}

export default function GameCarousel({ games, schedule, date, showPlayerLinks=jornadaDateAllowed(date),nbaSlate=false,partial=false,checkedAt }: { games: any[]; schedule: JornadaGame[]|null; date:string; showPlayerLinks?:boolean;nbaSlate?:boolean;partial?:boolean;checkedAt:number }) {
  const teamFor=(game:any,side:string)=>canonicalTeam(game.competitions?.[0]?.competitors?.find((c:any)=>c.homeAway===side)?.team?.abbreviation);
  const official=schedule??[];
  const rows=official.map(event=>{
    const eventDate=event.eventDate??date;
    const matching=games.filter(game=>argentinaDate(game.date)===eventDate&&teamFor(game,"away")===event.away&&teamFor(game,"home")===event.home);
    const feed=matching.length===1?matching[0]:null;
    const game={...(feed??{}),date:event.start,competitions:feed?.competitions??[{competitors:[{homeAway:"away",team:{abbreviation:event.away}},{homeAway:"home",team:{abbreviation:event.home}}]}]};
    return {event:{...event,date:eventDate},game,state:gameCardStatus(event.status,feed?.status?.type?.state,event.start,checkedAt)};
  });
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
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-xs text-[var(--text-muted)]">
          {partial ? "Puede faltar algún partido de la madrugada · Hora ARG" : "Hora ARG"}
        </span>
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
    </div>
  );
}
