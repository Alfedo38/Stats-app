import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),root=process.cwd(),checks=[];
async function check(name,run){await run();checks.push(name);console.log('OK '+name);}
function loader(){
 const cache=new Map();
 function load(name){
  if(!name.startsWith('.')&&!name.startsWith('@/')&&!path.isAbsolute(name))return require(name);
  let file=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(root,name);
  if(!fs.existsSync(file))file=['.ts','.tsx','.mjs','.js'].map(ext=>file+ext).find(fs.existsSync);
  if(!file)throw Error('No existe módulo '+name);
  if(file.endsWith('.css'))return {};
  if(cache.has(file))return cache.get(file).exports;
  const module={exports:{}};cache.set(file,module);
  const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(output,{module,exports:module.exports,require:n=>n.startsWith('.')?load(path.resolve(path.dirname(file),n)):load(n),console,Date,Number,Map,Set,URLSearchParams,AbortController,fetch:()=>{throw Error('Red desactivada');}},{filename:path.relative(root,file)});
  return module.exports;
 }return load;
}
const load=loader(),e=load("./lib/marketEvidence.ts"),m=e.EVIDENCE_METRICS;
const row=(id,date,values)=>({game_id:String(id),game_date:date,season_type:"Regular Season",...values});
const twos=load('./lib/twoPointFieldGoals.ts'),windows=load('./lib/seasonWindows.ts');
const {minutesDistribution}=load('./lib/minutesDistribution.ts'),{playerH2H}=load('./lib/nbaPlayerH2H.ts');
const plain=v=>JSON.parse(JSON.stringify(v));
await check('Dobles restan triples sin confundir ceros ni nulos',()=>{
 assert.deepEqual(plain(twos.twoPointFieldGoals(20,11,7,3)),{attempts:13,made:8});
 assert.deepEqual(plain(twos.twoPointFieldGoals(3,1,3,1)),{attempts:0,made:0});
 assert.deepEqual(plain(twos.twoPointFieldGoals(20,null,7,3)),{attempts:13,made:null});
 assert.deepEqual(plain(twos.twoPointFieldGoals(5,4,4,1)),{attempts:null,made:null});
 assert.deepEqual(plain(twos.twoPointFieldGoals(5,3,null,4)),{attempts:null,made:null});
});
await check('2P% ponderado y datos de períodos no prestados de FULL',()=>{
 const s=e.summarizeEvidence([row(1,'2026-10-20',{fga:3,fgm:2,fg3a:2,fg3m:1}),row(2,'2026-10-21',{fga:9,fgm:0,fg3a:0,fg3m:0})],m.fg2_rate);
 assert.equal(s.average,10);assert.equal(s.count,2);
 const partial={fga:12,fgm:6,fg3a:7,fg3m:3,q1_fga:4,q1_fgm:2,q1_fg3a:2,q1_fg3m:1};
 assert.equal(e.evidenceValue(partial,'fg2a','Q1'),2);
 assert.equal(e.evidenceValue({...partial,q1_fg3a:null},'fg2a','Q1'),null);
 assert.equal(e.evidenceValue({...partial,period_scope:'Q1'},'fg2a'),null);
});
await check('L5 y L10 no rellenan una temporada con otra ni toman el propio día',()=>{
 const rows=[row('0002','2026-10-28',{value:7}),row(2,'2026-10-28',{value:7}),row(3,'2026-11-09',{value:40}),row(4,'2026-10-26',{value:null}),row(5,'2026-05-05',{value:19}),row(6,'2024-10-26',{value:21}),row(7,'2026-02-31',{value:15})];
 assert.deepEqual(plain(windows.seasonWindowValues(rows,'2026-11-09')),[{season:'2026-27',values:[7,null]},{season:'2025-26',values:[19]}]);
});
await check('Minutos no convierten ausencia en cero y el rango requiere muestra',()=>{
 assert.deepEqual(plain(minutesDistribution([10,20,30,40,50,null,0,-1])),{count:5,average:30,median:30,typical:[20,40]});
 assert.deepEqual(plain(minutesDistribution([10,35])),{count:2,average:22.5,median:22.5,typical:null});
});
await check('H2H exige rivales con minutos y separa cobertura, marca y partido completo',()=>{
 const fact=(i,player_id,team_abbreviation,opponent,extra={})=>row(i,'2026-10-23',{player_id,team_abbreviation,opponent,min:25,pts:20,...extra});
 const mark=(i,defensive_player_id,extra={})=>row(i,'2026-10-23',{offensive_player_id:1,defensive_player_id,offensive_team_abbr:'LAL',defensive_team_abbr:'ATL',matchup_minutes_sort:90,partial_possessions:2.5,player_points:4,matchup_field_goals_made:2,matchup_field_goals_attempted:3,matchup_three_pointers_made:0,matchup_three_pointers_attempted:1,...extra});
 const a=[fact('0022600010',1,'LAL','ATL'),fact('0022600011',1,'LAL','ATL'),fact('0022600012',1,'LAL','ATL'),fact('0022600013',1,'LAL','ATL')];
 const b=[fact(22600010,2,'ATL','LAL'),fact(22600011,2,'ATL','LAL'),fact(22600012,2,'LAL','ATL'),fact(22600013,2,'ATL','LAL',{min:0})];
 const result=playerH2H(a,b,[mark(22600010,2),mark(22600010,2),mark(22600011,9),mark(22600012,2),mark(22600020,2,{game_date:'2026-11-09'})],1,2,'2026-11-09');
 assert.equal(result.gamesTotal,2);assert.equal(result.marksTotal,1);
 assert.deepEqual(plain(result.coverage[0]),{season:'2026-27',games:2,gamesWithAssignments:2,direct:1});
 assert.equal(result.marks[0].minutes,1.5);assert.equal(result.marks[0].twoA,2);assert.equal(result.marks[0].twoM,2);
 assert.equal(result.games.find(g=>g.gameId==='22600010').attacker.pts,20);
});
console.log(`Mejoras NBA: ${checks.length} verificaciones correctas.`);
