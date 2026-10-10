import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const root=resolve('.'),temp=mkdtempSync(join(tmpdir(),'nba-render-'));
const require=createRequire(join(root,'package.json'));
const modules=new Map();
function load(file){
 if(modules.has(file))return modules.get(file).exports;
 const module={exports:{}};modules.set(file,module);
 const source=readFileSync(join(root,file),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const local=(name)=>{
  if(name.endsWith('.module.css')){
   const css=readFileSync(join(root,'components',name.replace(/^.*\//,'')),'utf8');
   const classes=Object.fromEntries([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map(match=>[match[1],match[1]]));
   return {__esModule:true,default:classes};
  }
  if(name.startsWith('@/components/'))return load(`components/${name.slice(13)}.tsx`);
  if(name.startsWith('@/lib/'))return load(`lib/${name.slice(6)}.ts`);
  if(name.startsWith('./'))return load(`lib/${name.slice(2)}.ts`);
  return require(name);
 };
 new Function('require','module','exports',compiled)(local,module,module.exports);return module.exports;
}
try{
 const Accordion=load('components/AnalysisAccordion.tsx').default;
 const accordion=renderToStaticMarkup(React.createElement(Accordion,{title:'Minutos y oportunidades',icon:'role'},React.createElement('p',null,'Contenido de prueba')));
 assert.ok(accordion.includes('<details'));assert.ok(accordion.includes('<summary'));assert.ok(accordion.includes('class="trigger"'));assert.ok(accordion.includes('class="title"'));assert.match(accordion,/class="[^"]*\bchevron\b[^"]*"/);assert.ok(accordion.includes('Contenido de prueba'));
 const Review=load('components/NBAProReview.tsx').default;
 const rows=Array.from({length:45},(_,i)=>({game_id:String(i+1),game_date:new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),pts:10,min:20,fga:8,fgm:4,fg3m:2}));
 const base={playerId:'1',rows,trainingRows:rows,scope:'FULL',market:'pts',line:10,opponent:null,homeAway:null,minMinutes:null,labels:[],outcomeFiltered:false,coverage:{total:45,available:45,seasons:[{season:'2024-25',full:45,available:45}]},loading:false,error:null};
 const render=(sample)=>renderToStaticMarkup(React.createElement(Review,{sample}));
 const {ChartIdentity,PLAYER_PERIODS}=load('components/PlayerIdentity.tsx');
 assert.equal(PLAYER_PERIODS.Q1.short,'1Q');
 for(const [scope,label] of [['FULL','PARTIDO'],['Q1','1Q'],['H1','1H'],['H2_REG','2H']]){
  const title=renderToStaticMarkup(React.createElement(ChartIdentity,{playerName:'Ty Jerome',statLabel:'PTS',scope,count:10,line:4.5}));
  assert.ok(title.includes('Ty Jerome'));assert.ok(title.includes(`PTS · ${label}`));assert.ok(title.includes('10 partidos'));assert.ok(title.includes('4,5'));
 }
 const normal=render(base);assert.ok(normal.includes('Partidos evaluados'));assert.ok(normal.includes('Error promedio'));assert.ok(!normal.includes('NaN'));assert.ok(!normal.includes('Infinity'));
 assert.ok(render({...base,rows:[],trainingRows:[]}).includes('No hay partidos para analizar'));
 assert.ok(render({...base,scope:'H1',rows:[{game_id:'1',game_date:'2025-01-01',pts:0,min:10}],trainingRows:[]}).includes('Primera mitad'));
 assert.ok(render({...base,loading:true}).includes('La proyección se habilita'));assert.ok(!render({...base,loading:true}).includes('Partidos evaluados'));
 assert.ok(render({...base,error:'Sin cobertura'}).includes('Sin cobertura'));assert.ok(render({...base,outcomeFiltered:true}).includes('Evaluación desactivada'));
 assert.ok(render(null).includes('Preparando la muestra'));
 assert.ok(render({...base,rows:[{game_id:'1',game_date:'2025-01-01',pts:0}],trainingRows:[]}).includes('S/D'));
 console.log('Render Pro: muestra normal, vacía, parcial, faltantes, carga, error y filtros de resultados OK.');
}finally{rmSync(temp,{recursive:true,force:true});}
