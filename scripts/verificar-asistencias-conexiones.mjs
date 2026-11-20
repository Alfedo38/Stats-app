import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),ts=require('typescript');
let session=true,loads=0,broken=false;
const mock={
 '@/lib/auth/server':{withAuth:fn=>req=>session?fn(req):{status:401},readBody:req=>req.json()},
 '@/lib/nbaAssistConnectionsData':{readAssistConnections:async()=>{loads++;if(broken)throw Error();return {source:'local',snapshot};}},
 'next/server':{NextResponse:{json:(data,options)=>({data,status:options.status??200,headers:options.headers})}},
};
const cache=new Map();
function load(file){
 const p=path.resolve(file.endsWith('.ts')?file:file+'.ts');
 if(cache.has(p))return cache.get(p).exports;
 const module={exports:{}};cache.set(p,module);
 const {outputText}=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 vm.runInNewContext(outputText,{module,exports:module.exports,require:n=>n in mock?mock[n]:n.startsWith('@/')?load(n.slice(2)):n.startsWith('.')?load(path.join(path.dirname(p),n)):require(n),Date,Object,Number},{filename:p});
 return module.exports;
}
const {verifiedAssistSnapshot,summarizeAssistConnections}=load('lib/nbaAssistConnections.ts');
const a='0022600273',b='0022600255',c='0022600239';
const teams=[['SAS',[1,2,3,4,5]],['DET',[6,7,8,9,10]]];
const make=(id,date,rosters,pairs)=>({id,date,rosters,pairs});
const raw={version:1,team:'SAS',season:'2026-27',names:Object.fromEntries(Array.from({length:11},(_,i)=>[i+1,'Jugador '+(i+1)])),games:[
 make(a,'2026-11-19',teams,[[1,2,0,3],[2,1,2,1],[1,2,4,1],[6,7,0,10]]),
 make(b,'2026-11-17',teams,[[1,2,0,5]]),
 make(c,'2026-11-15',[['SAS',[2,3,4,5,11]],teams[1]],[]),
]};
const snapshot=verifiedAssistSnapshot(raw);
const s=summarizeAssistConnections(snapshot,1,[a,String(Number(a)),c]);
assert.equal(s.requested,2);
assert.equal(s.covered,1);
assert.equal(s.given[0].id,2);
assert.equal(s.given[0].total,4);
assert.equal(s.given[0].zones[0],3);
assert.equal(s.received[0].total,1);
assert.equal(s.unknownZone,1);
assert.equal(summarizeAssistConnections(snapshot,1,[a,b]).given[0].games,2);
assert.equal(summarizeAssistConnections(snapshot,5,[a,b]).covered,2);
assert.equal(summarizeAssistConnections(snapshot,5,[a,b]).given.length,0);
assert.equal(summarizeAssistConnections(null,5,[a,b]).covered,0);
const invalid=structuredClone(raw);invalid.games[0].pairs.push([1,6,0,1]);
assert.throws(()=>verifiedAssistSnapshot(invalid),/ASSIST_PAIR/);
invalid.games[0].pairs.pop();invalid.games[0].pairs.push([...invalid.games[0].pairs[0]]);
assert.throws(()=>verifiedAssistSnapshot(invalid),/ASSIST_PAIR/);

const {POST}=load('app/api/nba-asistencias-conexiones/route.ts');
const call=(playerId,gameIds)=>POST({json:async()=>({playerId,gameIds})});
session=false;assert.equal((await call(1,[a])).status,401);session=true;
assert.equal((await call(1,[a,'x'])).status,400);assert.equal((await call(1,Array(31).fill(a))).status,400);
assert.equal(loads,0);
const result=await call('1',[a,c]);
assert.equal(result.status,200);assert.equal(result.data.covered,1);
assert.equal(result.headers['Cache-Control'],'private, no-store');
assert.equal(result.data.given[0].total,4);assert.equal(result.data.received[0].total,1);
assert.equal('games' in result.data,false);
broken=true;assert.equal((await call(1,[a])).status,503);
console.log('OK Cobertura, zonas, participantes, filtros y API autenticada.');

if(process.argv[2]){
 const actual=verifiedAssistSnapshot(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
 const ids=actual.games.map(g=>g.id);
 const totals=actual.games.flatMap(g=>g.pairs).reduce((sum,p)=>sum+p[3],0);
 const castle=summarizeAssistConnections(actual,1642264,ids);
 const wemby=summarizeAssistConnections(actual,1641705,ids);
 assert.equal(castle.covered,6);assert.equal(wemby.covered,6);assert.equal(totals,343);
 const given=castle.given.find(x=>x.id===1641705),received=wemby.received.find(x=>x.id===1642264);
 assert.ok(given?.total>0);assert.equal(given.total,received.total);assert.deepEqual(given.zones,received.zones);
 console.log(`OK Piloto real: ${ids.length} partidos, ${totals} AST; Castle → Wembanyama: ${given.total} (${given.zones.join('/')}).`);
}
