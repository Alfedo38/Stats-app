import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),root=process.cwd(),checks=[];
async function check(name,run){await run();checks.push(name);console.log('OK '+name);}
const react={useMemo:f=>f(),useCallback:f=>f,useEffect(){},useLayoutEffect(){},useRef:v=>({current:v}),useState:v=>[typeof v==='function'?v():v,()=>{}]};
function loader(overrides={}){
 const cache=new Map();
 function load(name){
  if(name in overrides)return overrides[name];
  if(name==='react')return react;
  if(name==='recharts')return Object.fromEntries(['Bar','CartesianGrid','Cell','ComposedChart','LabelList','Line','ReferenceLine','Tooltip','XAxis','YAxis'].map(n=>[n,n]));
  if(name==='next/navigation')return{useSearchParams:()=>new URLSearchParams(),usePathname:()=>'/players/1'};
  if(!name.startsWith('.')&&!name.startsWith('@/')&&!path.isAbsolute(name))return require(name);
  let file=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(root,name);
  if(!fs.existsSync(file))file=['.ts','.tsx','.mjs','.js'].map(ext=>file+ext).find(fs.existsSync);
  if(!file)throw Error('No existe módulo '+name);
  if(file.endsWith('.css'))return {};
  if(cache.has(file))return cache.get(file).exports;
  const module={exports:{}};cache.set(file,module);
  const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(output,{module,exports:module.exports,require:n=>n in overrides?overrides[n]:n.startsWith('.')?load(path.resolve(path.dirname(file),n)):load(n),console,Date,Number,Map,Set,URL,crypto,URLSearchParams,AbortController,Object,Intl,process:{env:{NODE_ENV:"test"}},fetch:()=>{throw Error('Red desactivada');},...overrides.__globals},{filename:path.relative(root,file)});
  return module.exports;
 }return load;
}
function nodes(t){return !t||typeof t!=='object'?[]:[t,...[t.props?.children].flat(Infinity).flatMap(nodes)];}
function find(t,type){return nodes(t).find(n=>n.type===type);}
function text(t){return t==null||typeof t==='boolean'?'':typeof t!=='object'?String(t):[t.props?.children].flat(Infinity).map(text).join('');}
const DOM=require('react-dom/server'),React=require('react'),jsx=require('react/jsx-runtime').jsx;
const ui=loader({'next/link':({children,href,...p})=>jsx('a',{...p,href,children})}),load=loader();
const html=(C,p)=>DOM.renderToStaticMarkup(jsx(C,p));
const Compare=load('./lib/absenceComparison.ts'),Legend=ui('./components/SelectionLegend.tsx').default;
const settings={playerId:1,teammateName:'Compañero',mode:'current',team:'ORL',market:'ast',scope:'FULL',side:'over',line:5.5,asOfDate:'2026-11-06',phase:'ALL',season:'all',lastN:20,opponent:null,homeAway:null,minMinutes:null,thresholds:[]};
const fact=(n,change={})=>({player_id:1,game_id:String(226000000+n).padStart(10,'0'),game_date:`2026-10-${String(30-n).padStart(2,'0')}`,season_id:'2026-27',season_type:'Regular Season',team_abbreviation:'ORL',matchup:'ORL vs. PHX',min:32,pts:24,reb:6,ast:5,fga:17,fgm:8,...change});
const facts=[fact(1),fact(2,{min:36,pts:28,reb:7,ast:6,fga:21,fgm:10})],mates=[{...fact(1),player_id:2}],absences=[{game_id:fact(2).game_id,team_abbreviation:'ORL',absent_teammate:'Compañero',absent_status:'OUT'}];
const compare=(f=facts,m=mates,a=absences,s={})=>Compare.compareAbsences(f,m,a,[],{...settings,...s},2);
await check('Los seis promedios siempre están presentes, aunque el mercado sea asistencias',()=>{
 const c=compare();for(const id of ['pts','reb','ast','fga','fgm','minutes'])assert.ok(c.withPlayer.metrics.some(m=>m.id===id));
 assert.equal(c.metricDifferences.find(m=>m.id==='pts').difference,4);assert.equal(c.metricDifferences.find(m=>m.id==='fga').difference,4);assert.equal(c.metricDifferences.find(m=>m.id==='fgm').difference,2);
});
await check('La diferencia negativa y cero se conservan',()=>{const c=compare([facts[0],{...facts[1],pts:20,reb:6}]);assert.equal(c.metricDifferences.find(m=>m.id==='pts').difference,-4);assert.equal(c.metricDifferences.find(m=>m.id==='reb').difference,0);});
await check('Sin dato no inventa cero ni una mejora',()=>{const c=compare([facts[0],{...facts[1],fga:null,fgm:null}]),m=c.metricDifferences.find(m=>m.id==='fga');assert.equal(m.withoutAverage,null);assert.equal(m.difference,null);assert.equal(m.withoutCount,0);});
await check('Un cero registrado cuenta como dato',()=>{const c=compare([facts[0],{...facts[1],ast:0}]);assert.equal(c.withoutPlayer.metrics.find(m=>m.id==='ast').average,0);assert.equal(c.withoutPlayer.metrics.find(m=>m.id==='ast').count,1);assert.equal(c.metricDifferences.find(m=>m.id==='ast').difference,-5);});
await check('Ausencia no comprobada queda fuera de los dos grupos',()=>{const c=compare(facts,[],[{...absences[0],absent_status:'QUESTIONABLE'}]);assert.equal(c.window.unknown,2);assert.equal(c.withPlayer.games,0);assert.equal(c.withoutPlayer.games,0);});
await check('Los registros de otro equipo no aportan presencia ni ausencia',()=>{const c=compare(facts,[{...mates[0],team_abbreviation:'LAL'}],[{...absences[0],team_abbreviation:'LAL'}]);assert.equal(c.withPlayer.games+c.withoutPlayer.games,0);});
await check('Predeterminado usa actual y anterior; permite consultar otra temporada explícitamente',()=>{
 const f=[...facts,fact(3,{game_date:'2025-04-10',season_id:'2024-25'}),fact(4,{game_date:'2026-04-10',season_id:'2025-26'})];
 assert.equal(compare(f).window.games,3);assert.equal(compare(f,[],[],{season:'2024-25'}).window.games,1);
});
await check('Un período sin datos no hereda FGA, FGM ni minutos del partido completo',()=>{const c=compare(facts,mates,absences,{scope:'Q1'});for(const group of [c.withPlayer,c.withoutPlayer])for(const metric of group.metrics)assert.equal(metric.average,null);});
await check('La tabla muestra seis estadísticas y diferencias por fila, sin veredicto inventado',()=>{
 const c={ok:true,...compare(),archiveId:'a'.repeat(64),teammateName:'Compañero',teammateId:2,periodsAvailable:true,rosterAt:'2026-11-06'};
 const text=html(ui('./components/AbsenceComparison.tsx').ComparisonResult,{data:c});assert.match(text,/Cómo cambia su rendimiento/);assert.match(text,/FGA/);assert.match(text,/FGM/);assert.match(text,/Diferencia/);assert.match(text,/\+4,0/);assert.doesNotMatch(text,/Lean|probabilidad de ganar/);
});
await check('Cuotas con datos y faltantes usan solo casa y precio',()=>{const C=ui('./components/QuotePriceCards.tsx').default,text=html(C,{label:'Cuotas',cards:[{key:'betano',label:'Bto',price:1.87,updatedAt:'2026-11-06T08:22:00Z'},{key:'stake',label:'Ste',price:null}],onSelectBook(){}});assert.match(text,/1,87/);assert.match(text,/Ste/);assert.match(text,/disabled/);assert.doesNotMatch(text,/<time|08:22|2026-11|captura/i);});
await check('La selección de casa vuelve a null al pulsarla otra vez',()=>{let chosen='';const C=ui('./components/QuotePriceCards.tsx').default,tree=C({label:'Cuotas',cards:[{key:'stake',label:'Ste',price:1.87}],selectedBook:'stake',onSelectBook:v=>{chosen=v;}});nodes(tree).find(n=>n.type==='button').props.onClick();assert.equal(chosen,null);});
await check('Las cuotas de ficha siguen al Over/Under sin mostrar horarios',()=>{const C=ui('./components/PlayerOddsComparison.tsx').default,rows=[{book:'stake',scope:'FULL',line:17.5,over_price:1.87,under_price:1.77,updated_at:'2026-11-06T08:22:00Z'}];const over=html(C,{rows,line:17.5,side:'over',loading:false,error:null}),under=html(C,{rows,line:17.5,side:'under',loading:false,error:null});assert.match(over,/1,87/);assert.match(under,/1,77/);assert.doesNotMatch(over,/<time|08:22/);});
await check('El gráfico de medias líneas no muestra empate; los faltantes tienen estado propio',()=>{assert.doesNotMatch(html(Legend,{}),/Empate|Nula/);assert.match(html(Legend,{hasMissing:true}),/Sin dato · fuera del cálculo/);assert.match(html(Legend,{hasPush:true}),/Nula/);});
await check('La barra permite 0.5 y fija paso uno; corrige una línea entera al salir del campo',()=>{let selected;const C=ui('./components/PlayerSelectionBar.tsx').default,tree=C({market:'pts',markets:[],scope:'FULL',lastN:20,side:'over',line:18,step:1,onLine:v=>{selected=v;}}),input=nodes(tree).find(n=>n.type==='input');assert.equal(input.props.min,.5);assert.equal(input.props.step,1);input.props.onBlur();assert.equal(selected,18.5);});
const report={ok:true,available:true,minGames:5,settings:{market:'pts',season:'2026-27'},rankings:{G:[{team:'ORL',allowed:48.7,leagueAverage:56,diffPct:-13.1,games:6,total:7,rank:27,rankedTeams:29}]}};
await check('Defensa explica promedio, comparación y cobertura con lenguaje sencillo',()=>{const C=ui('./components/DefenseContextCard.tsx').DefenseReadout,text=html(C,{data:report,opponent:'ORL',position:'G',side:'over'});assert.match(text,/48,7/);assert.match(text,/13,1% menos que el promedio/);assert.match(text,/6 de 7 partidos/);assert.match(text,/Suma de todos los jugadores/);assert.match(text,/Puesto 27 de 29/);assert.doesNotMatch(text,/Contexto en contra del Over/);});
await check('Defensa sin datos no convierte la falta de cobertura en cero',()=>{const C=ui('./components/DefenseContextCard.tsx').DefenseReadout,text=html(C,{data:{...report,rankings:{G:[{...report.rankings.G[0],games:0,allowed:null}]}},opponent:'ORL',position:'G',side:'over'});assert.match(text,/sin cobertura válida/);assert.doesNotMatch(text,/>0,0</);});
console.log(`\nAjustes profesionales: ${checks.length} pruebas correctas. Datos simulados; sin red ni base de datos.`);
