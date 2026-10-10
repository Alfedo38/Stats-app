import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import ts from 'typescript';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'nba-pro-source-'));process.on('exit',()=>fs.rmSync(temp,{recursive:true,force:true}));
for(const name of ['nbaContextNormalize','nbaContextGames']){
 let source=fs.readFileSync(new URL(`../lib/${name}.ts`,import.meta.url),'utf8');
 source=source.replace("import prisma from '@/lib/prisma';",'const prisma = {};');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("'./nbaContextNormalize'","'./nbaContextNormalize.mjs'");
 fs.writeFileSync(path.join(temp,name+'.mjs'),code);
}
const {contextSeason,normalizeContextGames}=await import(pathToFileURL(path.join(temp,'nbaContextNormalize.mjs')));
const {loadContextGames}=await import(pathToFileURL(path.join(temp,'nbaContextGames.mjs')));
for(const row of [{season_id:'22024'},{season:'2024'},{season_year:'2024-25'},{season:'2024-2025'},{game_date:'2025-04-01'}])assert.equal(contextSeason(row),'2024-25');
const source={player_id:203081,game_id:22400001,game_date:'2024-10-22',season_id:'22024',min_clean:30.5,pts:20,reb:5,ast:8,potential_ast:0,touches:null,usage_pct:.3,matchup_clean:'MIL vs. CHI',opponent_clean:'CHI',home_away_clean:'HOME'};
const rows=normalizeContextGames([source,{...source,split_code:'Q1'},source]);
assert.equal(rows.length,1);assert.equal(rows[0].game_id,'0022400001');assert.equal(rows[0].min,30.5);assert.equal(rows[0].season_type,'Regular Season');assert.equal(rows[0].season,'2024-25');assert.equal(rows[0].potential_ast,0);assert.equal(rows[0].touches,null);assert.equal(rows[0].opponent_abbr,'CHI');
let calls=[];
const cached=await loadContextGames(203081,'2024-25',{$queryRawUnsafe:async(sql,id)=>{calls.push(sql);assert.equal(id,203081);return [source];}});
assert.equal(cached.games.length,1);assert.equal(cached.source,'public.player_page_game_fact_cache');assert.equal(calls.length,1);
const fallback=await loadContextGames(203081,'2024-25',{$queryRawUnsafe:async sql=>{if(sql.includes('game_fact_cache'))throw new Error('No cache');return [{...source,season_id:null,season_year:'2024-25'}];}});
assert.equal(fallback.games.length,1);assert.equal(fallback.failures.length,1);
const unavailable=await loadContextGames(203081,'2025-26',{$queryRawUnsafe:async()=>[source]});assert.equal(unavailable.games.length,0);assert.deepEqual(unavailable.seasons,['2024-25']);
const broken=await loadContextGames(203081,'2024-25',{$queryRawUnsafe:async()=>{throw new Error('Failed');}});assert.equal(broken.failures.length,2);
assert.equal(normalizeContextGames([{...source,min_clean:null,min_text:'31:30'}])[0].min,31.5);
console.log('Fuente Pro: cache histórica, fallback, formatos de temporada, campos normalizados, duplicados y faltantes OK.');
