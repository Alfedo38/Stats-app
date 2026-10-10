import dotenv from 'dotenv';import {PrismaClient} from '@prisma/client';import ts from 'typescript';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
dotenv.config({path:'.env.local',quiet:true});dotenv.config({path:'.env',quiet:true});
const player=Number(process.argv[2]);
if(!Number.isSafeInteger(player)||player<=0){console.error('Uso: node scripts/diagnosticar-nba-periodos.mjs ID_NUMERICO_DE_LA_URL');process.exit(1);}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'nba-period-audit-'));process.on('exit',()=>fs.rmSync(temp,{recursive:true,force:true}));
for(const name of ['nbaContextNormalize','nbaPeriodStats']){const source=fs.readFileSync(new URL(`../lib/${name}.ts`,import.meta.url),'utf8');fs.writeFileSync(path.join(temp,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);}
const {normalizeContextGames}=await import(pathToFileURL(path.join(temp,'nbaContextNormalize.mjs')));
const {buildPeriodRows,periodMetricValue}=await import(pathToFileURL(path.join(temp,'nbaPeriodStats.mjs')));
const prisma=new PrismaClient();
const safeRows=rows=>JSON.parse(JSON.stringify(rows,(_,v)=>typeof v==='bigint'?Number(v):v));
const report={player_id:player,read_only:true,sources:{},seasons:[],issues:[]};
try{
 let raw=[];
 for(const source of ['player_page_game_fact_cache','player_game_logs']){try{const rows=await prisma.$queryRawUnsafe(`select * from public.${source} where player_id=$1::bigint order by game_date desc limit 2000`,player);report.sources[source]={rows:rows.length,ok:true};if(!raw.length)raw=safeRows(rows);}catch{report.sources[source]={ok:false};}}
 const full=normalizeContextGames(raw),bySeason=new Map();
 let splits=[];
 try{splits=safeRows(await prisma.$queryRawUnsafe(`select * from public.player_period_splits_front_v2_cache where player_id=$1::bigint order by game_date desc limit 3000`,player));report.sources.player_period_splits_front_v2_cache={rows:splits.length,ok:true};}catch{report.sources.player_period_splits_front_v2_cache={ok:false};}
 const getId=row=>String(row.game_id).replace(/^0+/,'');
 const h1=new Map(buildPeriodRows(raw,splits,'H1','fg3m').map(row=>[getId(row),row]));
 const h2=new Map(buildPeriodRows(raw,splits,'H2_REG','fg3m').map(row=>[getId(row),row]));
 const q1=new Map(buildPeriodRows(raw,splits,'Q1','fg3m').map(row=>[getId(row),row]));
 for(const row of full){
   const counts=bySeason.get(row.season)??{season:row.season,full:0,q1_3pm:0,h1_3pm:0,h2_3pm:0,nonzero_full:0,h1_equals_full_nonzero:0};counts.full++;
   const id=getId(row),first=h1.get(id),second=h2.get(id),f=periodMetricValue(row,'fg3m','FULL');counts.q1_3pm+=q1.has(id)?1:0;counts.h1_3pm+=first?1:0;counts.h2_3pm+=second?1:0;
   const a=first?periodMetricValue(first,'fg3m','H1'):null,b=second?periodMetricValue(second,'fg3m','H2_REG'):null;
   if(f!==null&&f>0){counts.nonzero_full++;if(a===f)counts.h1_equals_full_nonzero++;}
   if(f!==null&&((a!==null&&a>f)||(b!==null&&b>f)||(a!==null&&b!==null&&a+b>f)))report.issues.push({game_id:row.game_id,date:row.game_date,full_3pm:f,h1_3pm:a,h2_3pm:b,type:'Parciales mayores que el total'});
   bySeason.set(row.season,counts);
 }
 report.seasons=[...bySeason.values()].sort((a,b)=>b.season.localeCompare(a.season));
 report.issues=report.issues.slice(0,20);
 report.note='Igualdad entre una mitad y FULL puede ser real. Revisar especialmente tasas altas sostenidas en partidos con triples. H1+H2_REG puede ser menor que FULL por prórroga. Se auditan registros disponibles, no cobertura completa del proveedor.';
 console.log(JSON.stringify(report,null,2));
}catch{console.error('No se pudo completar el diagnóstico. Revisá conexión y dependencias; no se modificó ningún dato.');process.exitCode=1;}
finally{await prisma.$disconnect();}
