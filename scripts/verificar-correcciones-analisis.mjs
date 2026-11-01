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
  vm.runInNewContext(output,{module,exports:module.exports,require:n=>n in overrides?overrides[n]:n.startsWith('.')?load(path.resolve(path.dirname(file),n)):load(n),console,Date,Number,Map,Set,URLSearchParams,AbortController,fetch:()=>{throw Error('Red desactivada');},...overrides.__globals},{filename:path.relative(root,file)});
  return module.exports;
 }return load;
}
function nodes(t){return !t||typeof t!=='object'?[]:[t,...[t.props?.children].flat(Infinity).flatMap(nodes)];}
function find(t,type){return nodes(t).find(n=>n.type===type);}
function text(t){return t==null||typeof t==='boolean'?'':typeof t!=='object'?String(t):[t.props?.children].flat(Infinity).map(text).join('');}
const load=loader(),s=load('./lib/selectionStats.ts'),f=load('./lib/formatters.ts'),p=load('./lib/nbaPeriodStats.ts'),role=load('./lib/nbaRole.ts');
const base={player_id:1,game_id:'0001',game_date:'2026-10-27',pts:40,reb:6,ast:8,min:35.5,matchup:'LAL vs. POR'},values=[30,35,45,40,50,39,38,33,42,31];
await check('Ausentes, booleanos y objetos no inventan cero',()=>{for(const v of[null,undefined,'',' ',false,true,{},[],NaN,Infinity,-1])assert.equal(s.finiteStat(v),null);assert.equal(s.finiteStat(0),0);});
await check('Under y Over estrictos separan el empate',()=>{for(const side of['over','under'])assert.equal(s.selectionOutcome(20,20,side),'push');assert.equal(s.selectionOutcome(19,20,'under'),'hit');assert.equal(s.selectionOutcome(21,20,'over'),'hit');});
await check('Under L10 7/10 y últimos tres 2/3',()=>{assert.equal(s.selectionSummary(values,41.5,'under').hits,7);assert.equal(s.selectionSummary(values.slice(-3),41.5,'under').hits,2);});
await check('Empates y faltantes fuera del porcentaje decidido',()=>{const r=s.selectionSummary([null,0,5,7],5,'under');assert.equal(r.hits,1);assert.equal(r.pushes,1);assert.equal(r.missing,1);assert.equal(r.decided,2);assert.equal(r.rate,50);});
await check('Sin muestra y solo empates conservan porcentaje nulo',()=>{assert.equal(s.selectionSummary([],5,'over').average,null);assert.equal(s.selectionSummary([5,5],5,'over').rate,null);});
await check('Minutos MM:SS válidos y rechazo de entradas inválidas',()=>{assert.equal(f.getMinutesValue({min:'31:30'}),31.5);for(const min of['31:99',true,{},-2])assert.equal(f.getMinutesValue({min}),null);});
for(const scope of['Q1','H1','H2_REG'])await check(scope+' no hereda 35.5 minutos completos',()=>{const r=p.buildPeriodRows([base],[{game_id:'1',split_code:scope,pts:12,min_text:'35:30'}],scope,'pts')[0];assert.equal(r.pts,12);assert.equal(r.min,null);assert.equal(r.full_game_minutes,35.5);assert.equal(f.getMinutesValue(r),null);assert.equal(role.roleValue(r,role.ROLE_METRICS[0]),null);});
await check('Minutos explícitos del período y cero real se conservan',()=>{for(const minutes of[0,9.5]){const r=p.buildPeriodRows([base],[{game_id:'1',split_code:'Q1',pts:0,period_minutes:minutes}],'Q1','pts')[0];assert.equal(f.getMinutesValue(r),minutes);assert.equal(r.pts,0);assert.equal(r.period_minutes_verified,true);}});
await check('Tiempos fuera del máximo del período se rechazan',()=>{assert.equal(p.buildPeriodRows([base],[{game_id:'1',split_code:'Q1',pts:4,period_minutes:35.5}],'Q1','pts')[0].min,null);});
await check('Combo parcial incompleto no copia el partido completo',()=>{assert.equal(p.buildPeriodRows([base],[{game_id:'1',split_code:'Q1',pts:4,reb:null}],'Q1','pts+reb').length,0);});
await check('La muestra compacta conserva la prueba de minutos',()=>{assert.equal(f.getMinutesValue(role.compactRoleRows([{...base,split_code:'Q1',period_scope:'Q1',period_minutes_verified:true,min:9}])[0]),9);});
const pick=load('./components/PickInsightPanel.tsx').default,common={stats:[],lineValue:41.5,activeStatLabel:'PTS',hitRate:0,hits:0,avgValue:'0',avgMinutes:'S/D',lastN:0};
await check('Sin partidos no hay Lean Under, AVG cero ni minutos limpios',()=>{const html=text(pick(common));assert.match(html,/Sin muestra para evaluar/);assert.match(html,/AVG S\/D/);assert.ok(!/Lean Under|Minutos limpios|0\/3/.test(html));});
await check('Tarjeta Under 7/10 y últimos tres 2/3, con texto correcto',()=>{const html=text(pick({...common,stats:values.map(value=>({...base,value})),side:'under',lastN:10}));assert.match(html,/7\/10 Under/);assert.match(html,/Últimos 3: 2\/3/);assert.match(html,/por debajo de/);assert.match(html,/Lean Under/);});
await check('Menos de cinco partidos informa muestra insuficiente',()=>{assert.match(text(pick({...common,stats:[{value:0},{value:0}],lastN:2})),/Muestra insuficiente/);});
await check('Carga o error bloquean veredictos con datos anteriores',()=>{for(const state of[{loading:true},{error:'falló'}])assert.ok(!/Lean Over|Lean Under|100%/.test(text(pick({...common,stats:Array.from({length:10},()=>({value:99})),...state}))));});
const chart=load('./components/PlayerChart.tsx').default;
await check('Ceros reales siguen dibujando el gráfico',()=>assert.ok(find(chart({data:[{...base,value:0}],lineValue:1.5}),'ComposedChart')));
await check('Barras Under y empates usan el resultado común',()=>{const data=find(chart({data:[{...base,value:5},{...base,game_id:'2',value:4}],lineValue:5,side:'under'}),'ComposedChart').props.data;assert.equal(data[0]._barState,'push');assert.equal(data[1]._barState,'over');});
await check('Tracking faltante mantiene el corte de la línea',()=>{const t=chart({data:[{...base,value:5,potential_ast:6},{...base,game_id:'2',value:4,potential_ast:null}],lineValue:5,overlayKey:'potential_ast'});assert.equal(find(t,'Line').props.connectNulls,false);assert.equal(find(t,'ComposedChart').props.data[1]._overlayValue,null);});
const log=load('./components/GameLogTable.tsx').default;
await check('Game Log coincide: Under 7/10 y 70%',()=>{const html=text(log({stats:values.map(value=>({...base,value})),lineValue:41.5,side:'under',activeStatLabel:'PTS'}));assert.match(html,/7\/10 Under/);assert.match(html,/70%/);});
await check('Game Log vacío muestra S/D, nunca 0%',()=>assert.ok(!text(log({stats:[],lineValue:5,activeStatLabel:'PTS'})).includes('0%')));
await check('Fechas estables en Buenos Aires y UTC',()=>{const old=process.env.TZ;try{for(const tz of['UTC','America/Argentina/Buenos_Aires']){process.env.TZ=tz;assert.equal(f.formatDateOnly('2026-10-27'),'27/10');assert.equal(f.formatDateOnly('2026-10-27',{year:true}),'27/10/26');assert.equal(f.formatDateOnly('2026-10-27T00:00:00.000Z'),'27/10');}}finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}});
const pro=load('./components/NBAProReview.tsx').default;
await check('Por 36 desactivado sin minutos comprobados del período',()=>{const t=pro({sample:{playerId:'1',rows:[{...base,split_code:'Q1'}],trainingRows:[],scope:'Q1',market:'pts',line:10,labels:[],coverage:{total:1,available:1,seasons:[]},loading:false,error:null}});assert.equal(nodes(t).find(n=>n.type==='button'&&text(n)==='Por 36 minutos').props.disabled,true);});
const fixture=[{...base,game_id:'3',game_date:'2026-10-27',pts:20,ast:null},{...base,game_id:'2',game_date:'2026-10-26',pts:19},{...base,game_id:'1',game_date:'2026-10-25',pts:null}];
const api=rows=>loader({'./nbaArchive':{archiveEnabled:()=>true,archivedPlayer:async()=>rows},'@/lib/prisma':{}})('./lib/playerHistory.ts');
await check('API conserva empate, faltante, media y combo incompleto',async()=>{const r=await api(fixture).getPlayerHistoricalExplorer({playerId:1,playerName:'QA',market:'PTS',line:20,side:'under',mode:'all',phase:'ALL'});assert.equal(r.summary.hits,1);assert.equal(r.summary.pushes,1);assert.equal(r.summary.missing,1);assert.equal(r.summary.hitRatePct,100);assert.equal(r.summary.avg,19.5);assert.equal(r.games[0].outcome,'push');assert.equal(r.games[0].hit,null);assert.equal(r.games[2].value,null);assert.equal(r.games[0].pa,null);});
await check('API sin filas conserva AVG y porcentaje nulos',async()=>{const r=await api([]).getPlayerHistoricalExplorer({playerId:999,market:'PTS',line:10,phase:'ALL'});assert.equal(r.summary.avg,null);assert.equal(r.summary.hitRatePct,null);});
// Actual hook with controlled promises: no browser, network or database required.
const slots=[],effects=[],requests=[];let cursor=0;
const hookReact={...react,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],n=>{slots[i]=typeof n==='function'?n(slots[i]):n;}];},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});}};
const query=loader({react:hookReact,__globals:{fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))}})('./hooks/useAnalysisQuery.ts');
const render=(url,body)=>{cursor=0;return query.useAnalysisQuery(url,body);},commit=()=>{while(effects.length)effects.shift()();},tick=()=>new Promise(r=>setTimeout(r,0));
await check('Cambiar mercado oculta lo anterior antes del efecto',async()=>{assert.equal(render('/history',{player:1,market:'PTS'}).loading,true);commit();requests[0].resolve({ok:true,json:async()=>({ok:true,games:[{value:40}]})});await tick();assert.equal(render('/history',{player:1,market:'PTS'}).data.games[0].value,40);const r=render('/history',{player:1,market:'3PTM'});assert.equal(r.data,null);assert.equal(r.loading,true);});
await check('Respuesta tardía del jugador anterior se descarta',async()=>{commit();render('/history',{player:2,market:'3PTM'});commit();assert.equal(requests[1].options.signal.aborted,true);requests[2].resolve({ok:true,json:async()=>({ok:true,games:[{value:2}]})});await tick();requests[1].resolve({ok:true,json:async()=>({ok:true,games:[{value:99}]})});await tick();assert.equal(render('/history',{player:2,market:'3PTM'}).data.games[0].value,2);});
await check('Error vigente no deja datos anteriores visibles',async()=>{render('/history',{player:3});commit();requests.at(-1).reject(Error('Fallo simulado'));await tick();const r=render('/history',{player:3});assert.equal(r.data,null);assert.equal(r.loading,false);assert.equal(r.error,'Fallo simulado');});
await check('Consulta desactivada no expone datos ni hace llamadas',()=>{const n=requests.length,r=render(null);commit();assert.equal(r.data,null);assert.equal(r.loading,false);assert.equal(requests.length,n);});
const stubs=Object.fromEntries(['PlayerChart','SupportingDataGrid','PickInsightPanel','PlayerHistoricalExplorer','ActiveInjuryContextCard','StatFilters','GameLogTable','PlayerIdentity','PlayerAbsenceFilter','PlayerOddsComparison','ShareButton'].map(n=>['@/components/'+n,{__esModule:true,default:n,ChartIdentity:'ChartIdentity'}]));
let answer={data:null,loading:true,error:null};
const container=loader({...stubs,'@/hooks/useAnalysisQuery':{useAnalysisQuery:url=>url==='/api/player-history'?answer:{data:null,loading:false,error:null}},'./useAnalysisQuery':{useAnalysisQuery:url=>url==='/api/player-history'?answer:{data:null,loading:false,error:null}}})('./components/PlayerChartContainer.tsx').default;
const props={stats:[base],navStats:[{id:'pts',label:'PTS'}],playerName:'QA',playerId:1,externalFilters:[]};
await check('Contenedor no usa SSR mientras espera el histórico',()=>{const t=container(props);assert.equal(find(t,'PlayerChart').props.data.length,0);assert.ok(!text(t).includes('AVG: 40'));});
await check('Contenedor usa los datos vigentes al terminar',()=>{answer={data:{ok:true,games:[{...base,value:12,minutes:30}]},loading:false,error:null};assert.equal(find(container(props),'PlayerChart').props.data[0].value,12);});
const report={package:'nba-correcciones-analisis-v1',ok:true,checks:checks.length,tests:checks,fixtures:true,network:false,database:false};
const output=path.join(root,'maintenance-state/qa/correcciones-analisis-v1.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});
console.log(`\nAnálisis: ${checks.length} verificaciones correctas. Informe privado: ${path.relative(root,output)}. Sin red ni base de datos.`);
