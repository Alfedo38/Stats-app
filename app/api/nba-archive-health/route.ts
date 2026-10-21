import {NextResponse} from 'next/server';
import {archiveEnabled,archiveManifest,archivePart} from '@/lib/nbaArchive';
export const runtime='nodejs';export const dynamic='force-dynamic';
// Sólo metadatos de salud; los archivos deportivos siguen en rutas con autenticación.
export async function GET(){
  if(!archiveEnabled())return NextResponse.json({ok:false,readerVersion:1},{status:503});
  try{
    const m=await archiveManifest(true);
    for(const kind of ['facts','shots','matchups']){
      const names=Object.keys(m.parts).filter(n=>n.startsWith(kind+'/'));
      if(!names.length||!m.counts[kind])throw Error('ARCHIVE_EMPTY');
      for(const n of [names[0],names[names.length-1]])await archivePart(n,m);
    }
    await archivePart('summaries',m);
    return NextResponse.json({ok:true,readerVersion:1,archiveId:m.id},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({ok:false,readerVersion:1},{status:503});}
}
