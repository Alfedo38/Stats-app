import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
let query=async()=>[],calls=[],wrapped=0;
const prisma={$queryRawUnsafe:async(...args)=>{calls.push(args);return query(...args);}};
const roster=[{player_id:1,full_name:'Target',team_abbreviation:'MIN'},{player_id:2,full_name:'Alice',team_abbreviation:'MIN'},{player_id:3,full_name:'Bob',team_abbreviation:'MIN'}];
const cache=new Map();
function load(file){
 if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const require=name=>{
  if(name==='@/lib/prisma')return {__esModule:true,default:prisma};
  if(name==='@/lib/auth/server')return {withAuth:fn=>{wrapped++;return fn;},readBody:req=>req.json()};
  if(name==='@/lib/currentRosters')return {CURRENT_ROSTER_SEASON:'2026-27',CURRENT_ROSTER_UPDATED_AT:'2026-10-26',getCurrentRosterPlayer:id=>roster.find(p=>p.player_id===id),getCurrentRosterTeam:team=>roster.filter(p=>p.team_abbreviation===team)};
  if(name==='next/server')return {NextResponse:{json:(data,options={})=>({data,status:options.status??200,headers:options.headers??{}})}};
  if(name==='./nbaArchive'||name==='@/lib/nbaArchive')return {archiveEnabled:()=>false,archivedPlayer:async()=>[]};
  if(name==='server-only')return {};
  if(name.startsWith('@/lib/'))return load(`lib/${name.slice(6)}.ts`);
  throw Error(`Import inesperado: ${name}`);
 };
 new Function('require','module','exports',code)(require,module,module.exports);return module.exports;
}
const absences=load('app/api/player-absence/route.ts'),history=load('app/api/player-history/route.ts');
assert.equal(wrapped,3);
const req=body=>({json:async()=>body});
const catalog=[{name:'Alice',team:'MIN',games:1},{name:'Bob',team:'MIN',games:0},{name:'Former',team:'CHA',games:3}];
const bad=await absences.POST(req({playerId:1,names:Array(9).fill('A')}));assert.equal(bad.status,400);assert.equal(calls.length,0);
assert.equal((await absences.GET({url:'http://localhost/?playerId=bad'})).status,400);
query=async()=>catalog;
assert.deepEqual((await absences.GET({url:'http://localhost/?playerId=1'})).data.names,['Alice','Bob']);
query=async sql=>sql.includes('WITH requested')?[{name:'Alice',game_id:'0022600001'}]:catalog;
let result=await absences.POST(req({playerId:1,names:['Alice','Bob']}));assert.deepEqual(result.data.matches,{Alice:['0022600001'],Bob:[]});
assert.equal(calls.at(-1)[1],1);assert.equal(calls.at(-1)[3],'MIN');assert.equal(result.headers['Cache-Control'],'private, no-store');
assert.equal((await absences.POST(req({playerId:1,names:['Former']}))).status,400);
const dangerous="Robert'); DROP TABLE players;--";
query=async()=>catalog;await absences.POST(req({playerId:1,names:[dangerous]}));assert.ok(calls.every(args=>!args[0].includes(dangerous)));
query=async()=>{throw Error('fixture connection password');};result=await absences.POST(req({playerId:1,names:['Alice']}));assert.equal(result.status,503);assert.ok(!JSON.stringify(result).includes('password'));
const fixtures=[{player_id:1,game_id:'0022500001',game_date:'2025-10-21',min:20,pts:10},{player_id:1,game_id:'0042500001',game_date:'2026-04-21',min:30,pts:20}];
query=async(sql,...params)=>{const phase=params.at(-1);return phase==='Playoffs'?fixtures.slice(1):phase==='Regular Season'?fixtures.slice(0,1):fixtures;};
for(const [phase,count] of [['Playoffs',1],['Regular Season',1],['ALL',2]]){
 result=await history.POST(req({playerId:1,market:'PTS',line:10.5,mode:'all',phase,limit:100}));assert.equal(result.status,200);assert.equal(result.data.phase,phase);assert.equal(result.data.games.length,count);
 if(phase!=='ALL'){assert.ok(calls.at(-1)[0].includes('to_jsonb(h)'));assert.equal(calls.at(-1).at(-1),phase);assert.equal(result.data.games[0].season_type,phase);}
}
console.log('API filtros: catálogo actual, contexto por equipo, validación, ausencia vacía, consultas parametrizadas, privacidad y fases OK. Datos simulados.');
