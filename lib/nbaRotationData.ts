import 'server-only';
import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {archiveEnabled,archiveManifest,archivePart} from './nbaArchive';
import {verifiedRotationRows,type RotationGame} from './nbaRotations';

type Manifest=Awaited<ReturnType<typeof archiveManifest>>;
type LocalSnapshot={version:1;players:Record<string,unknown>};
let local:{stamp:number;data:LocalSnapshot}|null=null;
async function localRows(playerId:number):Promise<RotationGame[]|null>{
 if(process.env.NODE_ENV!=='development'||process.env.NBA_ROTATIONS_LOCAL!=='1')return null;
 const path=join(process.cwd(),'maintenance-state','rotation-pilot','snapshot.json');
 try{
  const info=await stat(path);
  if(info.size>8_000_000)throw Error('ROTATION_LOCAL_LIMIT');
  if(!local||local.stamp!==info.mtimeMs){
   const data=JSON.parse(await readFile(path,'utf8'));
   if(data?.version!==1||!data.players||Array.isArray(data.players)||typeof data.players!=='object')throw Error('ROTATION_LOCAL_FORMAT');
   local={stamp:info.mtimeMs,data};
  }
  return verifiedRotationRows(local.data.players[String(playerId)]??[]);
 }catch(error){
  if((error as NodeJS.ErrnoException).code==='ENOENT')return null;
  throw error;
 }
}
export async function playerRotations(playerId:number,manifest?:Manifest){
 if(!Number.isSafeInteger(playerId)||playerId<=0)throw Error('ROTATION_PLAYER');
 const preview=await localRows(playerId);
 if(preview)return {source:'local' as const,available:true,rows:preview};
 if(!manifest&&!archiveEnabled())return {source:'none' as const,available:false,rows:[] as RotationGame[]};
 const m=manifest??await archiveManifest(),key='rotations/'+playerId;
 if(!m.parts[key])return {source:'none' as const,available:false,rows:[] as RotationGame[]};
 return {source:'archive' as const,available:true,rows:verifiedRotationRows(await archivePart(key,m))};
}
