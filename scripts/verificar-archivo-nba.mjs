import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import ts from 'typescript';
const fixture={facts:[{player_id:1,player_name:'Test Player',game_id:'0022600001',game_date:'2026-10-20',season:'2026-27',season_type:'Regular Season',team_abbreviation:'BOS',min:30,pts:20,reb:8,ast:6}],shots:[{player_id:1,game_id:'0022600001',game_date:'2026-10-20',game_event_id:1,shot_made_flag:1}],matchups:[{offensive_player_id:1,defensive_player_id:2,partial_possessions:10,game_date:'2026-10-20'}]};
const parts={},objects=new Map();
function part(name,value){const bytes=gzipSync(JSON.stringify(value)),hash=createHash('sha256').update(bytes).digest('hex'),path=`objects/${name}/${hash}.json.gz`;parts[name]={path,sha256:hash,bytes:bytes.length,rows:Array.isArray(value)?value.length:Object.keys(value).length};objects.set(path,bytes);}
part('facts/1',fixture.facts);part('shots/1/2026-27',fixture.shots);part('matchups/1/2026-27',fixture.matchups);
part('summaries',{players:{1:'Test Player'},positions:{2:'C'},fouls:[{player_id:2,season:'2026-27',games:1,pf_avg:3}],teamDates:{'2026-27/BOS':['2026-10-19','2026-10-20']},recent:{1:fixture.facts},defense:{'2026-27/ALL/BOS':[{zone:'Restricted Area',attempts:10}]}});
const manifest={format:1,id:'a'.repeat(64),counts:{facts:1,shots:1,matchups:1},parts};objects.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
Object.assign(process.env,{NBA_ARCHIVE_READ:'1',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'TEST_ONLY'});
let wrapped=0;const sql=[];
const prisma={players:{findUnique:async()=>({id:1,full_name:'Test Player'})},$queryRawUnsafe:async(query)=>{sql.push(query);if(query.includes('player_period_splits_front_v2_cache'))return [];throw Error('Se intentó usar tabla archivada');}};
function loader(){
 const modules=new Map();
 return function load(path){
  path=resolve(path);if(modules.has(path))return modules.get(path).exports;
  const m={exports:{}};modules.set(path,m);
  const js=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  function req(name){
   if(name==='server-only')return {};
   if(name.startsWith('node:'))return name==='node:crypto'?{createHash}:name==='node:zlib'?{gunzipSync:(...a)=>requireNativeGunzip(...a)}:{};
   if(name==='@/lib/prisma'||name==='./prisma')return {__esModule:true,default:prisma};
   if(name==='@/lib/auth/server')return {withAuth:fn=>{wrapped++;return fn;}};
   if(name==='next/server')return {NextResponse:{json:(data,init={})=>({data,status:init.status??200}),next:()=>({next:true,headers:new Map()}),redirect:()=>({status:307})}};
   if(name.startsWith('@/'))return load(name.slice(2)+'.ts');
   if(name.startsWith('.'))return load(resolve(dirname(path),name+'.ts'));
   throw Error('Import no simulado '+name);
  }
  new Function('require','module','exports',js)(req,m,m.exports);return m.exports;
 };
}
import {gunzipSync as requireNativeGunzip} from 'node:zlib';
const original=globalThis.fetch;let corrupt=false;
globalThis.fetch=async(url,options)=>{
 assert.equal(options.headers.Authorization,'Bearer TEST_ONLY');
 const name=String(url).split('/nba-history/')[1];let bytes=objects.get(name);
 if(!bytes)return {ok:false,status:404};
 if(corrupt&&name!=='manifest.json')bytes=Buffer.from('alterado');
 return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
};
try{
 const load=loader(),api=load('lib/nbaArchive.ts');
 assert.deepEqual(await api.archivedFacts(1),fixture.facts);
 assert.deepEqual(await api.archivedPlayer(null,'Test Player'),fixture.facts);
 assert.deepEqual(await api.archivedRest(1,'2026-27'),[{team:'BOS',date:'2026-10-19'},{team:'BOS',date:'2026-10-20'}]);
 const context=await api.archivedContext(1,'2026-27');assert.equal(context.matchups[0].defensive_position,'C');assert.equal(context.defenderFouls[0].pf_avg,3);
 const fast=load('lib/playerDataFast.ts');assert.equal((await fast.getPlayerDataFast(1)).stats[0].pts,20);
 const route=load('app/api/nba-context/route.ts');const response=await route.GET({url:'https://app.invalid/api/nba-context?playerId=1&season=2026-27'});assert.equal(response.status,200);assert.equal(response.data.shots.length,1);assert.equal(response.data.games.length,1);assert.equal(wrapped,1);
 const proxy=load('proxy.ts').proxy;
 assert.equal(proxy({nextUrl:{pathname:'/api/nba-archive-health'},cookies:{get:()=>undefined}}).next,true);
 assert.equal(proxy({nextUrl:{pathname:'/api/nba-context'},cookies:{get:()=>undefined}}).status,401);
 const health=load('app/api/nba-archive-health/route.ts');assert.equal((await health.GET()).data.ok,true);
 assert.ok(sql.every(q=>q.includes('player_period_splits_front_v2_cache')));
 await assert.rejects(()=>api.archivePart('bad',{parts:{bad:{...parts['facts/1'],path:'objects/../x.json.gz'}}}));
 corrupt=true;const broken=loader();await assert.rejects(()=>broken('lib/nbaArchive.ts').archivedFacts(1));assert.equal((await broken('app/api/nba-archive-health/route.ts').GET()).status,503);
 process.env.NBA_ARCHIVE_READ='0';assert.equal((await health.GET()).status,503);
 console.log('Archivo NBA: jugador, nombre, descanso, tiros, defensores, faltas, página rápida, API autenticada, salud, hash y errores OK.');
}finally{globalThis.fetch=original;delete process.env.NBA_ARCHIVE_READ;}
