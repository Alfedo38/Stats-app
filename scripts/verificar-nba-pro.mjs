import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'nba-pro-check-'));
process.on('exit',()=>fs.rmSync(temp,{recursive:true,force:true}));
for(const name of ['nbaRole','nbaPro']){
  const source=fs.readFileSync(new URL(`../lib/${name}.ts`,import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace("'./nbaRole'","'./nbaRole.mjs'");
  fs.writeFileSync(path.join(temp,`${name}.mjs`),code);
}
const {ROLE_METRICS, prepareRoleSeason, summarizeRole, roleNumber}=await import(pathToFileURL(path.join(temp,'nbaRole.mjs')));
const {paired,restDays,restGroups,onOff,proOpponent}=await import(pathToFileURL(path.join(temp,'nbaPro.mjs')));
import {validateStintGame,reconcileStints} from '../lib/nbaStints.mjs';
const metric=id=>ROLE_METRICS.find(m=>m.id===id);
assert.equal(roleNumber(null),null);assert.equal(roleNumber(''),null);assert.equal(roleNumber(0),0);
assert.equal(roleNumber('12:30',metric('minutes')),12.5);assert.equal(roleNumber('12:70',metric('minutes')),null);
assert.equal(roleNumber(.25,metric('usage')),25);assert.equal(roleNumber('0.5%',metric('usage')),.5);
const rows=[
  {game_id:'3',game_date:'2026-05-01',season:'2025-26',season_type:'Playoffs',min:20,touches:40,potential_ast:3,ast:4,usage_pct:null,team_abbreviation:'BOS'},
  {game_id:'2',game_date:'2026-04-01',season:'2025-26',season_type:'Regular Season',min:40,touches:60,potential_ast:null,ast:2,usage_pct:0},
  {game_id:'1',game_date:'2026-03-01',season:'2025-26',min:0,touches:0},
  {game_id:'old',game_date:'2025-04-01',season:'2024-25',min:30,touches:90},
  {game_id:'3',game_date:'2026-05-01',season:'2025-26',split_code:'Q1',min:10,touches:10}
];
const season=prepareRoleSeason(rows);assert.equal(season.label,'2025-26');assert.equal(season.games.length,2);
assert.equal(prepareRoleSeason([...rows,rows[0]]).games.length,2);
assert.equal(prepareRoleSeason(rows,'playoffs').games.length,1);
assert.equal(summarizeRole(season.games,metric('touches'),'per36').value,60);
assert.equal(summarizeRole(season.games,metric('usage')).value,0);
assert.equal(summarizeRole(season.games,metric('potential_ast')).invalid,1);
assert.equal(prepareRoleSeason([{game_date:'2026-10-01',season_year:'2026-27',min:20}]).label,'2026-27');
assert.equal(proOpponent({matchup:'BOS vs. MIA',team_abbreviation:'BOS'}),'MIA');
const pair=paired([{potential_ast:0,ast:0},{potential_ast:8,ast:4},{potential_ast:null,ast:5},{potential_ast:1,ast:2}],'potential_ast','ast');
assert.equal(pair.count,2);assert.equal(pair.conversion,50);assert.equal(pair.invalid,1);
assert.equal(restDays('2026-05-01','2026-04-30'),0);assert.equal(restDays('2026-05-01','2026-04-29'),1);assert.equal(restDays('2026-05-01','2026-05-01'),null);
// Team played yesterday while player was absent: must still count as a back-to-back.
const rest=restGroups([rows[0]],[{team:'BOS',date:'2026-04-28'},{team:'BOS',date:'2026-04-30'},{team:'BOS',date:'2026-05-01'}]);
assert.equal(rest.groups[0].rows.length,1);
const sample=[{game_id:'1',game_date:'2026-01-01',start_seconds:0,end_seconds:600,game_seconds:2880,lineup:[1,2,3,4,5],pts:5,reb:2,ast:1,fga:4},{game_id:'1',game_date:'2026-01-01',start_seconds:600,end_seconds:1800,game_seconds:2880,lineup:[1,6,3,4,5],pts:20,reb:8,ast:3,fga:9}];
assert.deepEqual(onOff(sample,2).map(s=>s.minutes),[10,20]);
assert.equal(onOff(sample,2)[0].values[0],18);assert.equal(onOff(sample,2)[1].values[0],36);
assert.equal(onOff([],2)[0].values[0],null);
const stats=Object.fromEntries([1,2,3,4,5].map(id=>[id,{pts:0,reb:0,ast:0,fga:0}]));
const game={game_id:'0022500001',game_date:'2025-10-21',season:'2025-26',season_type:'Regular Season',team_abbr:'BOS',game_seconds:2880,source:'fixture de prueba',stints:[{start_seconds:0,end_seconds:2880,lineup:[1,2,3,4,5],stats}]};
const valid=validateStintGame(game);reconcileStints(valid.totals,[1,2,3,4,5].map(player_id=>({player_id,min:48,pts:0,reb:0,ast:0,fga:0})));
assert.throws(()=>validateStintGame({...game,stints:[{...game.stints[0],start_seconds:1}]}));
assert.throws(()=>validateStintGame({...game,stints:[{...game.stints[0],lineup:[1,1,2,3,4]}]}));
assert.throws(()=>reconcileStints(valid.totals,[1,2,3,4,5].map(player_id=>({player_id,min:40,pts:0,reb:0,ast:0,fga:0}))));
assert.throws(()=>reconcileStints(valid.totals,[1,2,3,4,5].map(player_id=>({player_id,min:48,pts:1,reb:0,ast:0,fga:0}))));
console.log('NBA Pro: cálculos, faltantes, ceros, fases, descanso de equipo, On/Off y conciliación de quintetos OK.');
