import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
let query=async()=>[],calls=[],wrapped=0;
const prisma={$queryRawUnsafe:async(...args)=>{calls.push(args);return query(...args);}};
const cache=new Map();
function load(file){
 if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const require=(name)=>{
  if(name==='@/lib/prisma')return {__esModule:true,default:prisma};
  if(name==='@/lib/auth/server')return {withAuth:fn=>{wrapped++;return fn;}};
  if(name==='next/server')return {NextResponse:{json:(data,options={})=>({data,status:options.status??200,headers:options.headers??{}})}};
  if(name.startsWith('@/lib/'))return load(`lib/${name.slice(6)}.ts`);
  throw new Error(`Import inesperado: ${name}`);
 };
 new Function('require','module','exports',code)(require,module,module.exports);return module.exports;
}
const absences=load('app/api/player-absence/route.ts');
const history=load('app/api/player-history/route.ts');
assert.equal(wrapped,3);
const req=(body)=>({json:async()=>body});
const bad=await absences.POST(req({playerId:1,names:Array(9).fill('A')}));assert.equal(bad.status,400);assert.equal(calls.length,0);
assert.equal((await absences.GET({url:'http://localhost/?playerId=bad'})).status,400);
query=async()=>[{name:'Alice'}];assert.deepEqual((await absences.GET({url:'http://localhost/?playerId=1'})).data.names,['Alice']);
query=async()=>[{name:'Alice',game_id:'0022500001'}];
let result=await absences.POST(req({playerId:1,names:['Alice','Bob']}));assert.deepEqual(result.data.matches,{Alice:['0022500001'],Bob:[]});assert.deepEqual(calls.at(-1).slice(1),[1,['Alice','Bob']]);assert.equal(result.headers['Cache-Control'],'private, no-store');
const dangerous="Robert'); DROP TABLE players;--";query=async()=>[];await absences.POST(req({playerId:1,names:[dangerous]}));assert.ok(!calls.at(-1)[0].includes(dangerous));assert.deepEqual(calls.at(-1)[2],[dangerous]);
query=async()=>{throw new Error('fixture connection password');};result=await absences.POST(req({playerId:1,names:['Alice']}));assert.equal(result.status,503);assert.ok(!JSON.stringify(result).includes('password'));
const fixtures=[{player_id:1,game_id:'0022500001',game_date:'2025-10-21',min:20,pts:10},{player_id:1,game_id:'0042500001',game_date:'2026-04-21',min:30,pts:20}];
query=async(sql,...params)=>{const phase=params.at(-1);return phase==='Playoffs'?fixtures.slice(1):phase==='Regular Season'?fixtures.slice(0,1):fixtures;};
for(const [phase,count] of [['Playoffs',1],['Regular Season',1],['ALL',2]]){
 result=await history.POST(req({playerId:1,market:'PTS',line:10.5,mode:'all',phase,limit:100}));assert.equal(result.status,200);assert.equal(result.data.phase,phase);assert.equal(result.data.games.length,count);
 if(phase!=='ALL'){assert.ok(calls.at(-1)[0].includes('to_jsonb(h)'));assert.equal(calls.at(-1).at(-1),phase);assert.equal(result.data.games[0].season_type,phase);}
}
console.log('API filtros (base simulada): validación, ausencia desconocida/vacía, consultas parametrizadas, errores y fase antes del límite OK.');
