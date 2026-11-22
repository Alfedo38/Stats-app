import {NextResponse} from 'next/server';
import {withAuth} from '@/lib/auth/server';
import {favorabilityQuery,getMatchupFavorability} from '@/lib/nbaMatchupFavorabilityData';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export const GET=withAuth(async (req: Request)=>{
  const query=favorabilityQuery(new URL(req.url).searchParams);
  if(!query) return NextResponse.json({ok:false,error:'Revisá el jugador, los equipos y la fecha.'},{status:400,headers});
  try{return NextResponse.json(await getMatchupFavorability(query),{headers});}
  catch{return NextResponse.json({ok:false,error:'No pudimos verificar el ajuste por rival.'},{status:503,headers});}
});
