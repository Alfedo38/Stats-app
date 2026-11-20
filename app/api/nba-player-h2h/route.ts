import {NextRequest,NextResponse} from 'next/server';
import {archiveEnabled,archiveManifest,archivePart} from '@/lib/nbaArchive';
import {withAuth} from '@/lib/auth/server';
import {historyReferenceDate,matchupSeasons} from '@/lib/nbaHistoryWindow';
import {playerH2H} from '@/lib/nbaPlayerH2H';
import {isDate} from '@/lib/ticketReader/model';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=withAuth(async (req:NextRequest)=>{
 const p=req.nextUrl.searchParams,a=p.get('attacker'),d=p.get('defender'),event=p.get('before');
 const safeId=(v:string|null)=>v!==null&&/^[1-9]\d{0,11}$/.test(v);
 if(!safeId(a)||!safeId(d)||a===d||!isDate(event)||event<'2023-10-01')return NextResponse.json({ok:false,error:'Cruce o fecha inválidos.'},{status:400});
 if(!archiveEnabled())return NextResponse.json({ok:false,error:'El historial NBA no está disponible.'},{status:503});
 const today=historyReferenceDate(),cutoff=event<=today?event:today;
 const seasons=matchupSeasons(cutoff);
 try{
  const manifest=await archiveManifest();
  const factKeys=[`facts/${a}`,`facts/${d}`];
  const markKeys=seasons.map(s=>`matchups/${a}/${s}`);
  const [attacker,defender,...matches]=await Promise.allSettled([...factKeys,...markKeys].map(key=>archivePart(key,manifest)));
  if(attacker.status==='rejected'||defender.status==='rejected')return NextResponse.json({ok:false,error:'No se pudo leer el historial de los dos jugadores.'},{status:503});
  const list=(p:PromiseSettledResult<any>)=>p.status==='fulfilled'&&Array.isArray(p.value)?p.value:[];
  const missing=seasons.filter((_,i)=>matches[i].status==='rejected'||!manifest.parts[markKeys[i]]);
  return NextResponse.json({ok:true,...playerH2H(list(attacker),list(defender),matches.flatMap(list),Number(a),Number(d),cutoff),
   missing,hasBothFacts:factKeys.every(key=>Boolean(manifest.parts[key]))},{headers:{'Cache-Control':'private, max-age=60'}});
 }catch{
  return NextResponse.json({ok:false,error:'No se pudo leer el archivo NBA. Reintentá.'},{status:503});
 }
});
