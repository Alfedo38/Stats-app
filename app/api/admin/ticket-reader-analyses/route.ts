import {NextResponse, type NextRequest} from 'next/server';
import {withAuth} from '@/lib/auth/server';
import {analysisExport} from '@/lib/ticketReader/analysisStore';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=withAuth(async(request:NextRequest)=>{
 try{
  const data=await analysisExport();
  if(request.nextUrl.searchParams.get('download')==='1')return new NextResponse(JSON.stringify(data),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="analisis-tickets-${new Date().toISOString().slice(0,10)}.json"`}});
  return NextResponse.json({...data,analyses:data.analyses.slice(0,20).map(({id,receivedAt,tester,status,counts,settings})=>({id,receivedAt,tester,status,counts,eventDate:settings.eventDate}))});
 }catch{return NextResponse.json({ok:false,error:'El registro de análisis todavía no está disponible. Los análisis pendientes se reenvían desde cada navegador al recuperar la conexión.'},{status:503});}
},true);
