import {withAuth} from '@/lib/auth/server';
import {NextResponse} from 'next/server';
import {getPlayerOddsSnapshot} from '@/lib/playerOdds';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=withAuth(async(req:Request)=>{
 const playerName=String(new URL(req.url).searchParams.get('playerName')??'').trim();
 if(!playerName||playerName.length>120)return NextResponse.json({ok:false,error:'Jugador inválido'},{status:400});
 try{const result=await getPlayerOddsSnapshot(playerName);return NextResponse.json({ok:result.availability==='ready',...result,...(result.availability==='unavailable'?{error:'No se pudieron consultar las cuotas verificadas.'}:{})},{status:result.availability==='ready'?200:503,headers:{'Cache-Control':'private, no-store'}});}
 catch{return NextResponse.json({ok:false,error:'No se pudieron cargar las cuotas.'},{status:503});}
});
