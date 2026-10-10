import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import ts from 'typescript';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'nba-analysis-test-'));process.on('exit',()=>fs.rmSync(temp,{recursive:true,force:true}));
for(const name of ['nbaRole','nbaPeriodStats','nbaContextNormalize','nbaAnalysis']){let source=fs.readFileSync(new URL(`../lib/${name}.ts`,import.meta.url),'utf8');let code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;for(const dependency of ['nbaRole','nbaPeriodStats','nbaContextNormalize'])code=code.replaceAll(`'./${dependency}'`,`'./${dependency}.mjs'`);fs.writeFileSync(path.join(temp,name+'.mjs'),code);}
const {forecastPast,evaluateForecast,roleExplanation,sampleCoverage,leagueDelta,validHistory}=await import(pathToFileURL(path.join(temp,'nbaAnalysis.mjs')));
const rows=Array.from({length:70},(_,index)=>({game_id:String(index+1),game_date:new Date(Date.UTC(2025,9,21+index*2)).toISOString().slice(0,10),season:'2025-26',pts:20,fgm:8,fga:16,min:30,usage_pct:.25}));
assert.equal(forecastPast(rows.slice(0,9),'pts','FULL'),null);
assert.equal(forecastPast(rows.slice(0,10),'pts','FULL'),20);
const constant=evaluateForecast(rows,'pts','FULL');assert.equal(constant.results.length,60);assert.equal(constant.mae,0);assert.equal(constant.bias,0);assert.equal(constant.coverage,100);assert.equal(constant.intervalCount,40);assert.deepEqual(constant.interval,{low:20,high:20});
// Future results must not affect any earlier prediction or interval evaluation.
const altered=rows.map((row,index)=>({...row,pts:index===rows.length-1?100:row.pts}));
assert.deepEqual(evaluateForecast(altered,'pts','FULL').results.slice(0,-1),constant.results.slice(0,-1));
assert.deepEqual(evaluateForecast([...rows].reverse(),'pts','FULL'),constant);
assert.equal(validHistory([...rows,rows[0]]).length,70);
const missing=evaluateForecast(rows.map((row,index)=>({...row,pts:index<20?null:20})),'pts','FULL');assert.equal(missing.valid,50);assert.equal(missing.results.length,40);
assert.equal(evaluateForecast(rows.map(row=>({...row,pts:0})),'pts','FULL').mae,0);
const sameDate=[...rows.slice(0,12),{...rows[11],game_id:'duplicate_date',pts:500}];const same=evaluateForecast(sameDate,'pts','FULL');assert.equal(same.results.at(-1).prediction,20);
const half=rows.map(row=>({...row,split_code:'H1',fg3m:1,pts:10,min:15}));assert.equal(evaluateForecast(half,'fg3m','H1').next,1);
const noPartial=rows.map(row=>({...row,fg3m:4}));assert.equal(evaluateForecast(noPartial,'fg3m','H1').valid,0);
const coverage=sampleCoverage(rows,rows.slice(0,15));assert.equal(coverage.total,70);assert.equal(coverage.available,15);assert.equal(coverage.seasons[0].available,15);
const role=[...rows.slice(0,5).map(row=>({...row,min:30,fga:15})),...rows.slice(5,10).map(row=>({...row,min:36,fga:18}))];assert.ok(roleExplanation(role).some(text=>text.includes('jugar más')));
assert.ok(roleExplanation(rows.slice(0,4))[0].includes('Faltan'));
assert.equal(leagueDelta({attempts:49,made:30},{attempts:1000,made:500}),null);
assert.ok(Math.abs(leagueDelta({attempts:100,made:60},{attempts:1000,made:500})-10)<1e-9);
console.log('Análisis Pro: cronología sin información futura, faltantes, ceros, períodos, cobertura, rol y defensa vs liga OK.');
