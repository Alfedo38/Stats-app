import {NextResponse,type NextRequest} from 'next/server';
import {withAuth} from '@/lib/auth/server';
import {reportExport} from '@/lib/ticketReader/diagnostics';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=withAuth(async(request:NextRequest)=>{
 try{
  const data=await reportExport();
  if(request.nextUrl.searchParams.get('download')==='1')return new NextResponse(JSON.stringify(data,null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="lector-tickets-${new Date().toISOString().slice(0,10)}.json"`}});
  return NextResponse.json({...data,reports:data.reports.slice(0,30)});
 }catch{return NextResponse.json({ok:false,error:'El registro central todavía no está disponible. Las copias pendientes se reenvían desde cada navegador al recuperar la conexión.'},{status:503});}
},true);
