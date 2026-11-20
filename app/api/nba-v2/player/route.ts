import {NextResponse} from 'next/server';
import {withAuth} from '@/lib/auth/server';
import {getPlayerHistoricalExplorer} from '@/lib/playerHistory';
import {getCurrentRosterPlayer} from '@/lib/currentRosters';
import {jornadaDateAllowed} from '@/lib/nbaJornada';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=withAuth(async(req:Request)=>{
 const p=new URL(req.url).searchParams,id=p.get('id'),date=p.get('date');
 if(!id||!/^\d{1,10}$/.test(id)||Number(id)<1||!jornadaDateAllowed(date))return NextResponse.json({ok:false,error:'Jugador o fecha inválidos.'},{status:400});
 try{
  const roster=getCurrentRosterPlayer(Number(id));
  const data=await getPlayerHistoricalExplorer({playerId:id,market:'PTS',line:.5,side:'over',mode:'last2',phase:'ALL',asOfDate:date,limit:1000});
  const safe=JSON.parse(JSON.stringify({ok:true,player:roster?{id:Number(id),name:roster.full_name,team:roster.team_abbreviation,position:roster.position}:null,games:data.games,coverage:data.coverage},(_,v)=>typeof v==='bigint'?String(v):v));
  return NextResponse.json(safe,{headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({ok:false,error:'No pudimos consultar el histórico. Reintentá; los datos no se reemplazaron por cero.'},{status:503,headers:{'Cache-Control':'private, no-store'}});}
});
