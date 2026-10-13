import {withAuth} from '@/lib/auth/server';
import prisma from '@/lib/prisma';
import {NextResponse} from 'next/server';
import {cleanAbsences} from '@/lib/nbaGameFilters';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=withAuth(async(req:Request)=>{
 const player=Number(new URL(req.url).searchParams.get('playerId'));
 if(!Number.isSafeInteger(player)||player<=0)return NextResponse.json({ok:false,error:'Jugador inválido'},{status:400});
 try{
  const rows=await prisma.$queryRawUnsafe<{name:string}[]>(`select distinct trim(absent_teammate) as name from public.ludo_wo_games_modal_cache where player_id=$1::bigint and absent_teammate is not null and trim(absent_teammate)<>'' order by name limit 100`,player);
  return NextResponse.json({ok:true,names:rows.map(row=>row.name),source:'Ausencias registradas'},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({ok:false,error:'No se pudo cargar el catálogo de ausencias.'},{status:503});}
});
export const POST=withAuth(async(req:Request)=>{
 let body:any;try{body=await req.json();}catch{return NextResponse.json({ok:false,error:'Solicitud inválida'},{status:400});}
 const player=Number(body.playerId),names=cleanAbsences(body.names);
 if(!Number.isSafeInteger(player)||player<=0||!Array.isArray(body.names)||body.names.length>8||body.names.some((n:unknown)=>typeof n!=='string'||!n.trim()||n.length>100))return NextResponse.json({ok:false,error:'Elegí un jugador y hasta 8 compañeros válidos.'},{status:400});
 try{
  const matches:Record<string,string[]>=Object.fromEntries(names.map(name=>[name,[]]));
  if(names.length){
   const rows=await prisma.$queryRawUnsafe<{name:string;game_id:string}[]>(`select distinct requested.name, cache.game_id::text as game_id from unnest($2::text[]) as requested(name) join public.ludo_wo_games_modal_cache cache on lower(trim(cache.absent_teammate))=lower(requested.name) where cache.player_id=$1::bigint and cache.game_id is not null`,player,names);
   for(const row of rows)if(matches[row.name])matches[row.name].push(row.game_id);
  }
  return NextResponse.json({ok:true,matches,source:'Ausencias registradas'},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({ok:false,error:'No se pudieron consultar los partidos con ausencias. Reintentá.'},{status:503});}
});
