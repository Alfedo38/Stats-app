import {NextResponse} from 'next/server';
import {readBody,withAuth} from '@/lib/auth/server';
import {readAssistConnections} from '@/lib/nbaAssistConnectionsData';
import {ASSIST_GAME_LIMIT,assistGameIds,summarizeAssistConnections} from '@/lib/nbaAssistConnections';

import {TEAMS,isDate} from '@/lib/ticketReader/model';
import {historySeasons} from '@/lib/nbaHistoryWindow';

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
 const cutoff=typeof data.cutoff==='string'&&isDate(data.cutoff)?data.cutoff:null;
 const team=typeof data.rival==='string'&&TEAMS.includes(data.rival)?data.rival:null;
 if((data.cutoff!=null&&!cutoff)||(data.rival!=null&&!team))return NextResponse.json({ok:false,error:'El rival o la fecha son inválidos.'},{status:400,headers});
 try{
  const {snapshot,source,defense}=await readAssistConnections(ids,team&&cutoff?{team,cutoff,season:historySeasons(cutoff)[0].slice(2,4)}:undefined);
  if(cutoff)snapshot.games=snapshot.games.filter(game=>game.date<cutoff);
  return NextResponse.json({ok:true,source,defense,...summarizeAssistConnections(snapshot,Number(data.playerId),ids)},{headers});
 }catch{
  return NextResponse.json({ok:false,error:'No se pudieron cargar las conexiones. Reintentá.'},{status:503,headers});
 }
});
