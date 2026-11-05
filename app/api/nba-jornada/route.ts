import {NextResponse} from 'next/server';
import {withAuth} from '@/lib/auth/server';
import {getJornada,getNbaSlate,JornadaError} from '@/lib/nbaJornadaData';
import {jornadaDateAllowed,marketIsValid} from '@/lib/nbaJornada';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=withAuth(async(req:Request)=>{
  const q=new URL(req.url).searchParams,date=q.get('date'),market=q.get('market')??'pts';
  if(!jornadaDateAllowed(date)||!marketIsValid(market))return NextResponse.json({ok:false,error:'Elegí una fecha entre los últimos 30 días y los próximos siete días, y un mercado disponible.'},{status:400});
  try{return NextResponse.json(await (q.get('slate')==='nba'?getNbaSlate(date,market):getJornada(date,market)),{headers:{'Cache-Control':'private, no-store'}});}
  catch(error){return NextResponse.json({ok:false,error:error instanceof JornadaError?error.message:'No pudimos cargar la jornada. Reintentá en un momento.'},{status:error instanceof JornadaError?error.status:503,headers:{'Cache-Control':'private, no-store'}});}
});
