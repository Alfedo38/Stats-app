import 'server-only';
import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {archiveEnabled,archiveManifest,archivePart} from './nbaArchive';
import {assistShard} from './nbaAssistConnections';
import {boundedParts} from './nbaReadParts';
import {rotationGameId,verifiedRotationRows,type RotationGame} from './nbaRotations';

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
export async function playerRotations(playerId:number,manifest?:Manifest,ids?:readonly string[]){
 if(!Number.isSafeInteger(playerId)||playerId<=0)throw Error('ROTATION_PLAYER');
 const wanted=new Set((ids??[]).map(rotationGameId).filter((id):id is string=>id!==null));
 const chunks=[...new Set([...wanted].map(assistShard))];
 const localEnabled=process.env.NODE_ENV==='development'&&process.env.NBA_ROTATIONS_LOCAL==='1';
 const rows=new Map<string,RotationGame>();
 const add=(list:RotationGame[])=>{for(const row of list)if(!rows.has(row.gameId))rows.set(row.gameId,row);};
 const leagueKey=(chunk:string)=>`rotations/${chunk}`;
 const entries=(raw:unknown,chunk:string)=>{
  if(!Array.isArray(raw)||raw.length>16)throw Error('ROTATION_LEAGUE_FORMAT');
  return verifiedRotationRows(raw.flatMap(pair=>{
   if(!Array.isArray(pair)||pair.length!==2||pair[0]!==rotationGameId(pair[0])||assistShard(pair[0])!==chunk||
      !pair[1]||typeof pair[1]!=='object'||Array.isArray(pair[1]))throw Error('ROTATION_LEAGUE_GAME');
   if(!wanted.has(pair[0])||!Object.hasOwn(pair[1],String(playerId)))return [];
   const row=pair[1][String(playerId)];
   if(row?.gameId!==pair[0])throw Error('ROTATION_LEAGUE_ID');
   return [row];
  }));
 };
 if(localEnabled){
  await boundedParts(chunks,async chunk=>{
   const path=join(process.cwd(),'maintenance-state','assist-league','parts',leagueKey(chunk)+'.json');
   try{
    if((await stat(path)).size>280_000)throw Error('ROTATION_LOCAL_LIMIT');
    add(entries(JSON.parse(await readFile(path,'utf8')),chunk));
   }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  });
  const preview=await localRows(playerId);
  if(preview)add(preview);
  if(rows.size)return {source:'local' as const,available:true,rows:[...rows.values()]};
 }
 if(!manifest&&!archiveEnabled())return {source:'none' as const,available:false,rows:[] as RotationGame[]};
 const m=manifest??await archiveManifest(),key='rotations/'+playerId;
 const relevant=chunks.filter(chunk=>m.parts['assist-league-v2/'+leagueKey(chunk)]);
 if(!relevant.length&&!m.parts[key])return {source:'none' as const,available:false,rows:[] as RotationGame[]};
 await boundedParts(relevant,async chunk=>add(entries(await archivePart('assist-league-v2/'+leagueKey(chunk),m),chunk)));
 if(m.parts[key])add(verifiedRotationRows(await archivePart(key,m)));
 return {source:'archive' as const,available:true,rows:[...rows.values()]};
}
