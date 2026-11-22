import {NextResponse} from 'next/server';
import {stat,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {withAuth} from '@/lib/auth/server';
import {archiveEnabled,archiveManifest,archivePart} from '@/lib/nbaArchive';
import {historySeasons} from '@/lib/nbaHistoryWindow';
import {playerPlaytypes} from '@/lib/nbaPlaytypes';
import {getJornadaSchedule} from '@/lib/nbaJornadaData';
import {nbaSlateDate} from '@/lib/nbaSlate';
import {TEAMS,isDate} from '@/lib/ticketReader/model';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};

export const GET=withAuth(async(req:Request)=>{
 const params=new URL(req.url).searchParams,id=params.get('player')??'',cutoff=params.get('before'),rival=params.get('rival');
 if(!/^[1-9]\d{0,9}$/.test(id)||!isDate(cutoff)||rival&&!TEAMS.includes(rival))return NextResponse.json({ok:false,error:'Revisá el jugador o la fecha.'},{status:400,headers});
 try{
  const season=historySeasons(cutoff)[0],key=`nba-playtypes-v1/${season}`;
  const [away,home]=params.get('event')?.split('-')??[],date=params.get('date');
  let start:string|null=null;
  if(isDate(date)&&TEAMS.includes(away)&&TEAMS.includes(home)&&away!==home){
   const games=await getJornadaSchedule(date).catch(()=>[]);
   const exact=games.filter(g=>g.away===away&&g.home===home&&g.start&&nbaSlateDate(g.start,date)===cutoff);
   if(exact.length===1)start=exact[0].start;
  }
  const usableDay=(day:string)=>isDate(day)&&(day<cutoff||day===cutoff&&!!start);
  const verify=(data:unknown)=>playerPlaytypes(data,Number(id),rival,season,cutoff,start);
  if(process.env.NODE_ENV==='development'&&process.env.NBA_ASSIST_LOCAL==='1'){
   const path=join(process.cwd(),'maintenance-state','nba-playtypes');
   try{
    const candidates=(await readdir(path)).filter(n=>n.startsWith(season+'--')&&n.endsWith('.json')&&usableDay(n.slice(9,-5))).sort().reverse().slice(0,4);
    for(const name of [...candidates,season+'.json']){
     const filename=join(path,name);
     try{
      if((await stat(filename)).size>500_000)throw Error('PLAYTYPES_SIZE');
      const report=verify(JSON.parse(await readFile(filename,'utf8')));
      if(report.available)return NextResponse.json({ok:true,...report},{headers});
     }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    }
   }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
  if(archiveEnabled()){
   const manifest=await archiveManifest();
   const candidates=Object.keys(manifest.parts).filter(k=>k.startsWith(key+'/')&&usableDay(k.slice(key.length+1))).sort().reverse().slice(0,4);
   for(const name of [...candidates,key]){
    if(!manifest.parts[name])continue;
    const report=verify(await archivePart(name,manifest));if(report.available)return NextResponse.json({ok:true,...report},{headers});
   }
  }
  return NextResponse.json({ok:true,...verify(null)},{headers});
 }catch{return NextResponse.json({ok:false,error:'No se pudo verificar el perfil ofensivo.'},{status:503,headers});}
});
