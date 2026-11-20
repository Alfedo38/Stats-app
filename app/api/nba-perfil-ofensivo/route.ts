import {NextResponse} from 'next/server';
import {stat,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {withAuth} from '@/lib/auth/server';
import {archiveEnabled,archiveManifest,archivePart} from '@/lib/nbaArchive';
import {historySeasons} from '@/lib/nbaHistoryWindow';
import {playerPlaytypes} from '@/lib/nbaPlaytypes';
import {TEAMS,isDate} from '@/lib/ticketReader/model';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};

export const GET=withAuth(async(req:Request)=>{
 const params=new URL(req.url).searchParams,id=params.get('player')??'',cutoff=params.get('before'),rival=params.get('rival');
 if(!/^[1-9]\d{0,9}$/.test(id)||!isDate(cutoff)||rival&&!TEAMS.includes(rival))return NextResponse.json({ok:false,error:'Revisá el jugador o la fecha.'},{status:400,headers});
 try{
  const season=historySeasons(cutoff)[0],key=`nba-playtypes-v1/${season}`;
  let data:unknown=null;
  if(process.env.NODE_ENV==='development'&&process.env.NBA_ASSIST_LOCAL==='1'){
   const filename=join(process.cwd(),'maintenance-state','nba-playtypes',season+'.json');
   try{
    if((await stat(filename)).size>500_000)throw Error('PLAYTYPES_SIZE');
    data=JSON.parse(await readFile(filename,'utf8'));
   }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
  if(data===null&&archiveEnabled()){
   const manifest=await archiveManifest();
   if(manifest.parts[key])data=await archivePart(key,manifest);
  }
  return NextResponse.json({ok:true,...playerPlaytypes(data,Number(id),rival,season,cutoff)},{headers});
 }catch{return NextResponse.json({ok:false,error:'No se pudo verificar el perfil ofensivo.'},{status:503,headers});}
});
