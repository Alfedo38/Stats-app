import {withAuth} from '@/lib/auth/server';
import {NextResponse} from 'next/server';
import {getPlayerOddsMultiBook} from '@/lib/playerOdds';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=withAuth(async(req:Request)=>{
 const playerName=String(new URL(req.url).searchParams.get('playerName')??'').trim();
 if(!playerName||playerName.length>120)return NextResponse.json({ok:false,error:'Jugador inválido'},{status:400});
 try{return NextResponse.json({ok:true,odds:await getPlayerOddsMultiBook(playerName)},{headers:{'Cache-Control':'private, no-store'}});}
 catch{return NextResponse.json({ok:false,error:'No se pudieron cargar las cuotas.'},{status:503});}
});
