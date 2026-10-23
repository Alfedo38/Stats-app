import {NextResponse, type NextRequest} from 'next/server';
import {withAuth} from '@/lib/auth/server';
import {ANALYSIS_BYTES, sanitizeAnalysis} from '@/lib/ticketReader/analysisSnapshot';
import {saveAnalysis} from '@/lib/ticketReader/analysisStore';
export const runtime='nodejs';
export const dynamic='force-dynamic';

// This endpoint has its own bounded reader. Other auth endpoints keep their 4 KB limit.
async function readSnapshot(request:NextRequest){
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')||!request.body)throw Error('INVALID');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>ANALYSIS_BYTES+32){await reader.cancel();throw Error('TOO_LARGE');}chunks.push(part.value);}}
 finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export const POST=withAuth(async(request:NextRequest)=>{
 try{
  const body=await readSnapshot(request),snapshot=sanitizeAnalysis(body?.snapshot);
  if(!snapshot)return NextResponse.json({saved:false,code:'INVALID_ANALYSIS'},{status:400});
  const saved=await saveAnalysis(request,snapshot);
  return NextResponse.json({saved},saved?{}:{status:503});
 }catch(error){return NextResponse.json({saved:false,code:'INVALID_ANALYSIS'},{status:error instanceof Error&&error.message==='TOO_LARGE'?413:400});}
});
