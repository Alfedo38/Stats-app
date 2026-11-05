import {NextResponse} from 'next/server';
import {withAuth,readBody} from '@/lib/auth/server';
import {playerRotations} from '@/lib/nbaRotationData';
import {rotationGameId,rotationSample,summarizeRotation} from '@/lib/nbaRotations';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export const POST=withAuth(async (req:Request)=>{
 const data=await readBody(req),playerId=Number(data.playerId);
 if(!['string','number'].includes(typeof data.playerId)||!/^[1-9]\d{0,9}$/.test(String(data.playerId))||!Number.isSafeInteger(playerId)||!Array.isArray(data.gameIds)
   ||data.gameIds.length<1||data.gameIds.length>30||data.gameIds.some((x:unknown)=>rotationGameId(x)===null))
  return NextResponse.json({ok:false,error:'Revisá el jugador y los partidos.'},{status:400,headers});
 try{
  const d=await playerRotations(playerId);
  return NextResponse.json({ok:true,available:d.available,source:d.source,games:rotationSample(d.rows,data.gameIds),coverage:summarizeRotation(d.rows,data.gameIds)},{headers});
 }catch{
  return NextResponse.json({ok:false,error:'No se pudieron leer las rotaciones. Reintentá.'},{status:503,headers});
 }
});
