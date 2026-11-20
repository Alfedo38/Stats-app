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

const {assistDefense,assistShard,verifiedAssistShard}=load('lib/nbaAssistConnections.ts');
const normalized=raw.games[0],key=assistShard(a);
assert.equal(verifiedAssistShard([{...normalized,names:raw.names}],key).length,1);
assert.throws(()=>verifiedAssistShard([{...normalized,names:raw.names}],'0'),/ASSIST_SHARD_ID/);
assert.equal(s.given[0].together,1);
assert.equal(s.given[0].share,1);
assert.equal(s.givenZones[4],1);
const allowed=assistDefense([['2026-11-19',a,[3,0,2,0,0]],['2026-11-17',b,null],['2026-11-15',c,[2,0,0,0,0]]],'2026-11-19','26');
assert.equal(allowed.covered,1);
assert.equal(allowed.requested,2);
assert.equal(allowed.zones[0],2);
const {expectedMinutes}=load('lib/minutesResearch.ts');
const mk=(i,min,team='SAS')=>({game_id:i+1,game_date:new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10),team_abbreviation:team,min});
const observations=Array.from({length:40},(_,i)=>mk(i,Math.floor(i/5)%2===0?18:36));
const history=expectedMinutes([...observations,mk(61,50),mk(52,60,'LAL')],'2026-11-22','SAS');
assert.equal(history.observations,30);
assert.equal(expectedMinutes(observations.slice(0,5),'2026-11-22','SAS').estimate,null);
const {absenceRole}=load('lib/jornadaAbsenceImpact.ts');
const sRows=Array.from({length:16},(_,i)=>({...mk(i,30),pts:i<5?10:i<10?14:90,fga:i<5?6:i<10?8:50}));
const baseline=['1','2','3','4','5'],absent=['6','7','8','9','10'];
const cohort=absenceRole(sRows,[{present:baseline,absent:[...absent,'11']},{present:baseline,absent:[...absent,'12']}],'SAS');
assert.equal(cohort.find(x=>x.metric==='pts').delta,4);
assert.equal(cohort.find(x=>x.metric==='fga').withoutCount,5);
const {jornadaPriceGap}=load('lib/nbaJornada.ts');
const offers={quotes:[{book:'bet365',line:5.5,over_price:1.8},{book:'betano',line:5.5,over_price:2.2},{book:'stake',line:6.5,over_price:9,under_price:5}]};
assert.equal(jornadaPriceGap(offers,'over').best.book,'betano');
assert.equal(jornadaPriceGap(offers,'over').line,5.5);
assert.equal(jornadaPriceGap(offers,'under'),null);
const {playerPlaytypes}=load('lib/nbaPlaytypes.ts');
const style={version:1,season:'2026-27',capturedOn:'2026-11-19',players:{11:{Transition:[6,1.2,6,30]}},teams:{SAC:{Transition:[9,1.5,6,36]}}};
assert.equal(playerPlaytypes(style,11,'SAC','2026-27','2026-11-19').available,false);
assert.equal(playerPlaytypes(style,11,'SAC','2026-27','2026-11-20').rows[0].rivalPpp,1.5);
console.log('OK Bloques de liga, zona del rival, fechas de corte, bajas conjuntas, minutos y comparación exacta de cuotas.');
