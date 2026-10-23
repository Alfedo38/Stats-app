import {NextResponse,type NextRequest} from 'next/server';
import {withAuth,readBody} from '@/lib/auth/server';
import {sanitizeReport} from '@/lib/ticketReader/diagnosticModel';
import {saveReport} from '@/lib/ticketReader/diagnostics';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const POST=withAuth(async(request:NextRequest)=>{
 try{const body=await readBody(request),event=sanitizeReport(body.event);if(!event)return NextResponse.json({saved:false},{status:400});return NextResponse.json({saved:await saveReport(request,event)});}catch{return NextResponse.json({saved:false},{status:400});}
});
