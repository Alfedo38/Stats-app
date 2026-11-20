import {NextResponse} from 'next/server';
import {readBody,withAuth} from '@/lib/auth/server';
import {readAssistConnections} from '@/lib/nbaAssistConnectionsData';
import {ASSIST_GAME_LIMIT,assistGameIds,summarizeAssistConnections} from '@/lib/nbaAssistConnections';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};

export const POST=withAuth(async request=>{
 const data=await readBody(request);
 if(!['number','string'].includes(typeof data.playerId)||!/^[1-9]\d{0,9}$/.test(String(data.playerId))
  ||!Array.isArray(data.gameIds)||data.gameIds.length<1||data.gameIds.length>ASSIST_GAME_LIMIT){
  return NextResponse.json({ok:false,error:'Revisá el jugador y los partidos.'},{status:400,headers});
 }
 const ids=assistGameIds(data.gameIds);
 if(ids.length!==data.gameIds.length)return NextResponse.json({ok:false,error:'Revisá los partidos de la muestra.'},{status:400,headers});
 try{
  const {snapshot,source}=await readAssistConnections();
  return NextResponse.json({ok:true,source,...summarizeAssistConnections(snapshot,Number(data.playerId),ids)},{headers});
 }catch{
  return NextResponse.json({ok:false,error:'No se pudieron cargar las conexiones. Reintentá.'},{status:503,headers});
 }
});
