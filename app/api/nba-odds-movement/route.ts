import {withAuth} from '@/lib/auth/server';
import {NextResponse} from 'next/server';
import {Prisma} from '@prisma/client';
import prisma from '@/lib/prisma';
import {parseMovement,movementPoints,priorPrice} from '@/lib/nbaOddsMovement';
import {oddsPlayerNameCandidates} from '@/lib/oddsPlayerNames';
import {argDate,plusDays} from '@/lib/nbaJornada';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export const GET=withAuth(async(req:Request)=>{
 const selection=parseMovement(new URL(req.url).searchParams),today=argDate();
 if(!selection||selection.date<plusDays(today,-30)||selection.date>plusDays(today,7))return NextResponse.json({ok:false,error:'Elegí un partido de los últimos 30 días o uno próximo, y una línea válida.'},{status:400,headers});
 const names=oddsPlayerNameCandidates(selection.player);
 if(!names.length||names.length>32)return NextResponse.json({ok:false,error:'Nombre de jugador inválido.'},{status:400,headers});
 try{
  const [{enabled}]=await prisma.$queryRaw<{enabled:boolean}[]>`SELECT to_regclass('nba_odds_history.price_changes') IS NOT NULL AS enabled`;
  if(!enabled)return NextResponse.json({ok:true,enabled:false,points:[],limited:false,conflicts:0},{headers});
  const rows=await prisma.$queryRaw<Record<string,unknown>[]>(Prisma.sql`
    SELECT book, game_norm, player_name, player_norm, stat_key, period_scope, side, line, price, captured_at AS at
      FROM nba_odds_history.price_changes
     WHERE event_date=${selection.date}::date AND book=${selection.book}
       AND player_norm IN (${Prisma.join(names)}) AND side=${selection.side} AND line=${selection.line}
     ORDER BY captured_at DESC LIMIT 501`);
  if(rows.length>500)return NextResponse.json({ok:false,error:'La consulta supera el límite de capturas. No se mostró una serie parcial.'},{status:503,headers});
  let start:Date|null=null;
  if(rows.length&&selection.date<=today){
   const [a,b]=selection.game.split('-');
   try{
    const schedule=await prisma.$queryRaw<{start_utc:Date|null;status_id:number|null}[]>(Prisma.sql`
     SELECT start_utc,status_id FROM public.nba_daily_schedule
      WHERE event_date=${selection.date}::date AND postponed=false
        AND ((away=${a} AND home=${b}) OR (away=${b} AND home=${a})) LIMIT 2`);
    if(schedule.length===1&&[2,3].includes(Number(schedule[0].status_id)))start=schedule[0].start_utc;
   }catch{/* El movimiento registrado sigue disponible si falta el calendario. */}
  }
  return NextResponse.json({ok:true,enabled:true,...movementPoints(rows,selection),prior:priorPrice(rows,selection,start)},{headers});
 }catch{return NextResponse.json({ok:false,error:'No se pudo consultar el registro de cuotas.'},{status:503,headers});}
});
