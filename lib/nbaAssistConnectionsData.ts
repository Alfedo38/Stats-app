import 'server-only';
import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';

import {archiveEnabled,archiveManifest,archivePart} from './nbaArchive';
import {ASSIST_PART,verifiedAssistSnapshot,type AssistSnapshot} from './nbaAssistConnections';

const path=join(process.cwd(),'maintenance-state','assist-pilot','snapshot.json');
let preview:{mtime:number;size:number;data:AssistSnapshot}|null=null;

export async function readAssistConnections():Promise<{source:'local'|'archive'|'none';snapshot:AssistSnapshot|null}>{
 if(process.env.NODE_ENV==='development'&&process.env.NBA_ASSIST_LOCAL==='1'){
  try{
   const info=await stat(path);
   if(!info.isFile()||info.size>500_000)throw Error('ASSIST_LOCAL_SIZE');
   if(!preview||preview.mtime!==info.mtimeMs||preview.size!==info.size){
    preview={mtime:info.mtimeMs,size:info.size,data:verifiedAssistSnapshot(JSON.parse(await readFile(path,'utf8')))};
   }
   return {source:'local',snapshot:preview.data};
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 }
 if(archiveEnabled()){
  const manifest=await archiveManifest();
  if(manifest.parts[ASSIST_PART])return {source:'archive',snapshot:verifiedAssistSnapshot(await archivePart(ASSIST_PART,manifest))};
 }
 return {source:'none',snapshot:null};
}
