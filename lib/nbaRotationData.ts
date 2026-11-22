import 'server-only';
import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {archiveEnabled,archiveManifest,archivePart} from './nbaArchive';
import {countRotationChanges,type RotationChangeGame} from './nbaSubstitutions';
import {getCurrentRosterPlayer} from './currentRosters';
import {assistShard} from './nbaAssistConnections';
import {boundedParts} from './nbaReadParts';
import {rotationGameId,verifiedRotationRows,verifiedStarters,type RotationGame} from './nbaRotations';

type Manifest=Awaited<ReturnType<typeof archiveManifest>>;
type LocalSnapshot={version:1;players:Record<string,unknown>};
export type LastTeamLineup={team:string;date:string|null;players:{id:number;name:string}[]};
export async function lastTeamLineups(teams:string[],logs:{team:string;id:string;date:string}[],cutoff:string):Promise<LastTeamLineup[]>{
 const manifest=archiveEnabled()?await archiveManifest().catch(()=>null):null;
 return Promise.all(teams.map(async team=>{
  const rows=logs.filter(row=>row.team===team&&row.date<cutoff).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
  for(const row of rows){
   const id=rotationGameId(row.id);if(!id)continue;
   const key='assist-league-v2/rotations/'+assistShard(id);
   try{
    if(!manifest?.parts[key])continue;
    const games=await archivePart(key,manifest);
    if(!Array.isArray(games)||games.length>16)continue;
    const found=games.filter(pair=>Array.isArray(pair)&&pair.length===2&&pair[0]===id);
    if(found.length!==1)continue;
    const starters=verifiedStarters(found[0][1],id,team,row.date);
    if(starters.length)return {team,date:row.date,players:starters.map(pid=>({id:pid,name:getCurrentRosterPlayer(pid)?.full_name??'Jugador NBA '+pid}))};
   }catch{/* se conserva la previa aunque falte este bloque */}
  }
  return {team,date:null,players:[]};
 }));
}
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
 const rows=new Map<string,RotationGame>(),teams=new Map<string,RotationChangeGame>();
 const changes=()=>{
  const result=countRotationChanges([...teams.values()],playerId);
  const names=(rows:{id:number;count:number}[])=>rows.map(r=>({...r,name:getCurrentRosterPlayer(r.id)?.full_name??('Jugador NBA '+r.id)}));
  return {...result,inForPlayer:names(result.inForPlayer),playerInFor:names(result.playerInFor)};
 };
 const add=(list:RotationGame[])=>{for(const row of list)if(!rows.has(row.gameId))rows.set(row.gameId,row);};
 const leagueKey=(chunk:string)=>`rotations/${chunk}`;
 const entries=(raw:unknown,chunk:string)=>{
  if(!Array.isArray(raw)||raw.length>16)throw Error('ROTATION_LEAGUE_FORMAT');
  return raw.flatMap(pair=>{
   if(!Array.isArray(pair)||pair.length!==2||pair[0]!==rotationGameId(pair[0])||assistShard(pair[0])!==chunk||
      !pair[1]||typeof pair[1]!=='object'||Array.isArray(pair[1])||Object.keys(pair[1]).length>45)throw Error('ROTATION_LEAGUE_GAME');
   if(!wanted.has(pair[0])||!Object.hasOwn(pair[1],String(playerId)))return [];
   const [own]=verifiedRotationRows([pair[1][String(playerId)]]);
   if(own.gameId!==pair[0])throw Error('ROTATION_LEAGUE_ID');
   const players=new Map<number,RotationGame>();
   // La vista de cambios exige una reconstrucción de cinco en cancha. Una
   // rotación de un compañero inválida no debe ocultar los minutos del jugador.
   try {
    for(const [key,value] of Object.entries(pair[1])){
     if(!/^[1-9]\d{0,9}$/.test(key))throw Error('ROTATION_ROSTER');
     if((value as RotationGame)?.team!==own.team)continue;
     const [row]=verifiedRotationRows([value]);
     if(row.gameId!==own.gameId||row.date!==own.date||row.periods!==own.periods)throw Error('ROTATION_ROSTER');
     players.set(Number(key),row);
    }
    if(!teams.has(own.gameId))teams.set(own.gameId,{gameId:own.gameId,team:own.team,players});
   }catch{/* se conserva la rotación individual */}
   return [own];
  });
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
  if(rows.size)return {source:'local' as const,available:true,rows:[...rows.values()],changes:changes()};
 }
 if(!manifest&&!archiveEnabled())return {source:'none' as const,available:false,rows:[] as RotationGame[],changes:changes()};
 const m=manifest??await archiveManifest(),key='rotations/'+playerId;
 const relevant=chunks.filter(chunk=>m.parts['assist-league-v2/'+leagueKey(chunk)]);
 if(!relevant.length&&!m.parts[key])return {source:'none' as const,available:false,rows:[] as RotationGame[],changes:changes()};
 await boundedParts(relevant,async chunk=>add(entries(await archivePart('assist-league-v2/'+leagueKey(chunk),m),chunk)));
 if(m.parts[key])add(verifiedRotationRows(await archivePart(key,m)));
 return {source:'archive' as const,available:true,rows:[...rows.values()],changes:changes()};
}
