import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),root=process.cwd(),checks=[];
const {spawnSync}=require('node:child_process');
const python=spawnSync('python3',['scripts/verificar_defensas.py'],{cwd:root,encoding:'utf8'});
if(python.status!==0)throw Error(python.stdout+python.stderr);console.log(python.stdout);
const fixture=JSON.parse(fs.readFileSync('maintenance-state/qa/defensas-fixture.json','utf8'));
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
  vm.runInNewContext(output,{module,exports:module.exports,require:n=>n in overrides?overrides[n]:n.startsWith('.')?load(path.resolve(path.dirname(file),n)):load(n),console,Date,Number,Map,Set,URL,crypto,URLSearchParams,AbortController,Object,Intl,fetch:()=>{throw Error('Red desactivada');},...overrides.__globals},{filename:path.relative(root,file)});
  return module.exports;
 }return load;
}
const d=loader()('./lib/nbaDefense.ts');
const date='2026-10-30',base=d.defenseSettings({market:'pts',position:'G',opponent:'BKN',asOfDate:date,season:'2026-27',phase:'Regular Season'},date);
const settings=change=>({...base,...change});
const report=change=>({ok:true,available:true,archiveId:'a'.repeat(64),settings:base,seasons:['2026-27','2025-26'],through:'2026-10-24',source:'Archivo NBA',positionSource:'Catálogo de referencia',minGames:5,rankings:d.defenseRankings(fixture.games,base),recent:d.recentDefenders(fixture.players,base),recentAvailable:true,...change});
const ranks=report().rankings,top=ranks.G.find(r=>r.rank===1),bottom=ranks.G.find(r=>r.rank===30);
await check('Movimiento exige la misma línea y omite precios contradictorios',()=>{
 const m=loader()('./lib/nbaOddsMovement');
 const q=m.parseMovement(new URLSearchParams({date:'2026-11-03',game:'CLE-TOR',player:'Jugador QA',book:'stake',market:'PTS',scope:'FULL',side:'over',line:'20.5'}));
 assert.ok(q);
 const row={book:'stake',game_norm:'TOR @ CLE',player_name:'Jugador QA',player_norm:'jugador qa',stat_key:'PTS',period_scope:'FULL',side:'over',line:20.5,price:1.9};
 const result=m.movementPoints([
  {...row,at:new Date('2026-11-03T10:00:00.123Z')},
  {...row,at:'2026-11-03T10:00:00.123Z'},
  {...row,at:'2026-11-03T10:01:00Z',price:2},
  {...row,at:'2026-11-03T10:01:00Z',price:3},
  {...row,at:'2026-11-03T10:02:00Z',line:21.5,price:3},
  {...row,at:'2026-11-03T10:03:00Z',side:'under',price:3},
  {...row,at:'2026-11-03T10:04:00Z',price:2.1}
 ],q,Date.parse('2026-11-03T11:00:00Z'));
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{points:[{at:'2026-11-03T10:00:00.123Z',price:1.9},{at:'2026-11-03T10:04:00.000Z',price:2.1}],limited:false,conflicts:1});
});
await check('Perfil propio excluye otros períodos, fases y la fecha de corte',()=>{
 const m=loader()('./lib/nbaComparableProfile');
 const facts=Array.from({length:7},(_,i)=>({game_id:'002260000'+i,game_date:'2026-10-'+(20+i),min:'30:00',pts:i<5?22:99,usage_pct:i<5?.2:.9,period_scope:i===5?'Q1':'FULL'}));
 const shots=facts.flatMap(r=>Array.from({length:6},(_,i)=>({game_id:r.game_id,game_event_id:i,shot_attempted_flag:1,shot_zone_basic:i<3?'Restricted Area':'Above the Break 3'})));
 const result=m.playerComparableProfile(facts,shots,'2026-27','Regular Season','2026-10-26');
 assert.equal(result.games,5);assert.equal(result.points,22);assert.equal(result.usage,20);assert.equal(result.shot.attempts,30);
});
await check('Parámetros rechazan equipos, mercados, temporadas y fechas inválidas',()=>{for(const raw of [{market:'constructor'},{market:'__proto__'},{opponent:'xxx'},{position:'x'},{asOfDate:'2026-02-30'},{season:'2026-99'},{phase:'Preseason'},{window:'999'}])assert.equal(d.defenseSettings({...base,...raw},date),null);});
await check('Fecha en enero usa la temporada anterior y aliases distinguen 3PA de 3PM',()=>{assert.equal(d.defenseSeason('2026-01-03'),'2025-26');assert.equal(d.defenseMarket('3PT'),'fg3m');assert.equal(d.defenseMarket('3PA'),'fg3a');assert.equal(d.defensePosition('F-G'),'F');assert.equal(d.defensePosition('Guard-Forward'),'G');assert.equal(d.defensePosition('Forward-Center'),'F');assert.equal(d.defensePosition('Guard-unknown'),null);assert.equal(d.defensePosition('desconocida'),null);});
await check('Los cuatro grupos tienen 30 equipos con muestra visible',()=>{for(const group of ['ALL','G','F','C']){assert.equal(ranks[group].length,30);assert.ok(ranks[group].every(r=>r.games===15&&r.total===15&&r.rankedTeams===30));}});
await check('El puesto 1 siempre significa más permitido',()=>{assert.ok(top.allowed>bottom.allowed);assert.equal(d.rankBand(top),'high');assert.equal(d.rankBand(bottom),'low');});
await check('Mínimo de cinco excluye un ranking prematuro',()=>{const r=d.defenseRankings(fixture.games,settings({asOfDate:'2026-10-14'}));assert.equal(r.G[0].games,4);assert.equal(r.G[0].rank,null);assert.equal(r.G[0].rankedTeams,0);});
await check('El corte temporal excluye el día consultado y posteriores',()=>{const r=d.defenseRankings(fixture.games,settings({asOfDate:'2026-10-15'}));assert.equal(r.G[0].games,5);assert.equal(r.G[0].last,'2026-10-14');});
await check('Temporadas y fases se mantienen separadas',()=>{const r=d.defenseRankings([...fixture.games,...fixture.games.map(g=>({...g,season:'2025-26',groups:{ALL:{pts:999}}})),...fixture.games.map(g=>({...g,id:String(Number(g.id)+100000),phase:'Playoffs',groups:{ALL:{pts:999}}}))],base);assert.equal(r.ALL[0].games,15);assert.equal(d.defenseRankings(fixture.games,settings({phase:'Playoffs'})).ALL[0].games,0);});
await check('Ventana L10 se elige por equipo antes de contar valores ausentes',()=>{const rows=fixture.games.map(g=>g.team==='ATL'&&g.date==='2026-10-24'?{...g,groups:{ALL:{pts:null}}}:g),r=d.defenseRankings(rows,settings({window:'10'})).ALL.find(r=>r.team==='ATL');assert.equal(r.total,10);assert.equal(r.games,9);assert.equal(r.missing,1);assert.equal(r.first,'2026-10-15');});
await check('Promedio de liga pondera partidos válidos, no promedios incompletos por igual',()=>{const rows=fixture.games.filter(g=>g.team==='ATL'||g.team==='BKN'&&g.date<'2026-10-15'),r=d.defenseRankings(rows,base).G;const values=rows.map(g=>g.groups.G.pts);assert.equal(r[0].leagueAverage,values.reduce((s,n)=>s+n,0)/values.length);});
await check('Cero confirmado y grupos sin cobertura no se convierten uno en otro',()=>{const rows=fixture.games.map(g=>({...g,groups:{ALL:{pts:0},G:{pts:null}}})),r=d.defenseRankings(rows,base);assert.equal(r.ALL[0].allowed,0);assert.equal(r.G[0].allowed,null);assert.equal(r.G[0].rank,null);assert.equal(r.ALL[0].diffPct,null);});
await check('Combos requieren todos sus componentes; intentos usan su propia columna',()=>{assert.equal(d.defenseValue({pts:10,reb:3,ast:null},'pra'),null);assert.equal(d.defenseValue({pts:10,reb:3,ast:4},'pra'),17);assert.equal(d.defenseValue({fg3a:8,fg3m:1,fta:4},'fg3a'),8);assert.equal(d.defenseValue({fg3a:8,fg3m:1,fta:4},'fta'),4);});
await check('Duplicados canónicos no aumentan partidos; conflicto se excluye',()=>{const row=fixture.games[0],r=d.defenseRankings([...fixture.games,{...row,id:'0'+row.id}],base).ALL.find(r=>r.team===row.team);assert.equal(r.games,15);const bad=d.defenseRankings([...fixture.games,{...row,date:'2026-10-09'}],base).ALL.find(r=>r.team===row.team);assert.equal(bad.games,14);});
await check('Filtros alto/intermedio/bajo no adivinan rivales desconocidos',()=>{const rows=[{game_id:1,opponent:top.team},{game_id:2,matchup:'ATL @ '+bottom.team},{game_id:3,opponent:'xxx'}];assert.equal(d.filterDefense(rows,report(),'G','high').length,1);assert.equal(d.filterDefense(rows,report(),'G','low')[0].game_id,2);assert.equal(d.filterDefense(rows,null,'G','high').length,0);assert.equal(d.filterDefense(rows,null,'G','all').length,3);});
await check('Referencia con 29 equipos no simula tramos de un ranking de 30',()=>{assert.equal(d.rankBand({...top,rankedTeams:29}),null);});
await check('Tabla reciente respeta rival, posición, fase, fecha y 15+ minutos',()=>{const rows=[...fixture.players,{...fixture.players[0],opponent:'LAL'},{...fixture.players[0],playerId:999,minutes:14},{...fixture.players[0],playerId:999,date},{...fixture.players[0],playerId:999,phase:'Preseason'}],r=d.recentDefenders(rows,base);assert.equal(r.length,30);assert.ok(r.every(g=>g.position==='G'&&g.minutes>=15&&g.date<date));assert.ok(r.every(g=>g.playerId!==999));});
await check('La tabla reciente compara con promedio previo; PRA no suma promedios de muestras diferentes',()=>{const row={...fixture.players[0],baseline:{pts:10,reb:3,ast:4,pra:null}};assert.equal(d.recentDefenders([row],settings({market:'pts'}))[0].baseline,10);assert.equal(d.recentDefenders([row],settings({market:'pra'}))[0].baseline,null);});
await check('Enlaces compartidos validan temporada, ventana, posición y banda',()=>{const r=d.defenseUrlChoice(new URLSearchParams('defSeason=2025-26&defWindow=10&defPosition=F&defBand=low'));assert.equal(r.season,'2025-26');assert.equal(r.window,'10');assert.equal(r.band,'low');assert.equal(d.defenseUrlChoice(new URLSearchParams('defSeason=bad&defBand=constructor')).band,'all');});
let archiveCalls=0,enabled=true,missing=false,fail=false,failRecent=false;const versions=[];
const server=loader({'server-only':{},'./nbaArchive':{archiveEnabled:()=>enabled,archiveManifest:async()=>{archiveCalls++;if(fail)throw Error('private-secret');return{id:'a'.repeat(64),parts:missing?{}:{'defense/2026-27':{},'defense-players/2026-27/BKN':{}}};},archivePart:async(name,m)=>{versions.push(m.id);if(name.startsWith('defense-players/')){if(failRecent)throw Error('private-bucket');return fixture.players;}return fixture.snapshot;}}})('./lib/nbaDefenseData.ts');
await check('Adaptador solo usa partes archivadas y fija una versión para ranking y jugadores',async()=>{const r=await server.getDefenseReport(base,true);assert.equal(r.available,true);assert.equal(r.recentAvailable,true);assert.equal(r.recent.length,30);assert.equal(versions.length,2);assert.ok(versions.every(v=>v===r.archiveId));});
await check('Consultas repetidas reutilizan el resumen durante un minuto',async()=>{await server.getDefenseReport(base,true);assert.equal(archiveCalls,1);});
await check('Datos futuros no se filtran a la fecha de cobertura',async()=>{const r=await server.getDefenseReport(settings({asOfDate:'2026-10-14'}));assert.equal(r.through,'2026-10-13');});
await check('Archivo desactivado no hace consultas SQL ni descargas',async()=>{enabled=false;const before=archiveCalls,r=await server.getDefenseReport(settings({market:'fg3a'}));assert.equal(r.available,false);assert.equal(archiveCalls,before);enabled=true;});
await check('Resumen faltante explica que hay que publicarlo, conserva S/D',async()=>{missing=true;const r=await server.getDefenseReport(settings({market:'fta'}));assert.equal(r.available,false);assert.match(r.reason,/publicar/);assert.equal(r.through,null);missing=false;});
await check('Fallo de jugadores conserva ranking pero no aparenta tabla vacía válida',async()=>{failRecent=true;const r=await server.getDefenseReport(settings({market:'reb'}),true);assert.equal(r.available,true);assert.equal(r.recentAvailable,false);assert.equal(r.recent.length,0);failRecent=false;});
await check('Error no queda retenido en caché',async()=>{fail=true;await assert.rejects(server.getDefenseReport(settings({market:'ast'})));fail=false;assert.equal((await server.getDefenseReport(settings({market:'ast'}))).available,true);});
let authorized=true,routeCalls=0;const route=loader({'next/server':{NextResponse:{json:(data,init={})=>({data,status:init.status??200,headers:init.headers??{}})}},'@/lib/auth/server':{withAuth:fn=>req=>authorized?fn(req):{status:401}},'@/lib/nbaDefenseData':{getDefenseReport:async()=>{routeCalls++;if(fail)throw Error('private-key');return report();}}})('./app/api/nba-defense/route.ts');
const request=q=>new Request('https://example.invalid/api/nba-defense?'+q);
await check('Endpoint autentica, valida y usa respuesta privada sin caché pública',async()=>{authorized=false;assert.equal((await route.GET(request(''))).status,401);authorized=true;assert.equal((await route.GET(request('market=constructor'))).status,400);assert.equal(routeCalls,0);const r=await route.GET(request('market=pts&position=G&asOfDate='+date));assert.equal(r.status,200);assert.equal(r.headers['Cache-Control'],'private, no-store');});
await check('Errores no filtran claves o configuración',async()=>{fail=true;const r=await route.GET(request('market=pts'));assert.equal(r.status,503);assert.ok(!JSON.stringify(r).includes('private-key'));fail=false;});
const DOM=require('react-dom/server'),jsx=require('react/jsx-runtime').jsx;
const ui=loader({'next/link':({children,href,...props})=>jsx('a',{...props,href,children}),'@/hooks/useAnalysisQuery':{useAnalysisQuery:()=>({data:null,loading:false,error:null})}})('./components/DefenseContextCard.tsx');
await check('Resumen real diferencia S/D de cero y no pinta favorable por defecto',()=>{const r=report(),row=r.rankings.G.find(x=>x.team==='BKN');row.allowed=null;row.rank=null;row.diffPct=null;const html=DOM.renderToStaticMarkup(jsx(ui.DefenseReadout,{data:r,opponent:'BKN',position:'G',side:'under'}));assert.match(html,/S\/D/);assert.doesNotMatch(html,/FAV|DURO|Lean/);});
await check('Tarjeta identifica referencia FULL en Q1 y conserva controles plegados',()=>{const state={data:report(),report:report(),options:{season:'2026-27',window:'season',position:'G'},loading:false,error:null,market:'pts',url:'/api/nba-defense',band:'all',canFilter:false,select(){},setBand(){}};const html=DOM.renderToStaticMarkup(jsx(ui.default,{state,opponent:'BKN',scope:'Q1',side:'under'}));assert.match(html,/Referencia de partido completo/);assert.match(html,/No mide Q1/);assert.match(html,/Detalle y filtros defensivos/);assert.match(html,/Under/);assert.doesNotMatch(html,/<details[^>]*open/);});
// Exercise the actual chart and hook; only transport and heavy child components are replaced.
const stubs=Object.fromEntries(['PlayerChart','SupportingDataGrid','PickInsightPanel','PlayerHistoricalExplorer','StatFilters','GameLogTable','PlayerIdentity','PlayerAbsenceFilter','PlayerOddsComparison','ShareButton','DefenseContextCard'].map(n=>['@/components/'+n,{__esModule:true,default:n,ChartIdentity:'ChartIdentity'}]));
const history=[...Array.from({length:8},(_,i)=>({game_id:String(100+i),game_date:`2026-10-${String(10+i).padStart(2,'0')}`,season_type:'Regular Season',season_id:'2026-27',opponent:top.team,value:i,minutes:30,pts:i,reb:1,ast:1})),...Array.from({length:8},(_,i)=>({game_id:String(200+i),game_date:`2026-10-${String(18+i).padStart(2,'0')}`,season_type:'Regular Season',season_id:'2026-27',opponent:bottom.team,value:100,minutes:30,pts:100}))].reverse();
function nodes(t){return !t||typeof t!=='object'?[]:[t,...[t.props?.children].flat(Infinity).flatMap(nodes)];}
let defenseLoading=false,defenseError=null,scope='FULL';
const chart=loader({...stubs,'next/navigation':{usePathname:()=>'/players/1',useSearchParams:()=>new URLSearchParams('defBand=high&defSeason=2026-27&defPosition=G&n=5')},'@/hooks/useAnalysisQuery':{useAnalysisQuery:url=>url?.startsWith('/api/nba-defense')?{data:defenseLoading||defenseError?null:report(),loading:defenseLoading,error:defenseError}:url==='/api/player-history'?{data:{games:history},loading:false,error:null}:{data:null,loading:false,error:null}},'./useAnalysisQuery':{useAnalysisQuery:url=>({data:defenseLoading||defenseError?null:report(),loading:defenseLoading,error:defenseError})}})('./components/PlayerChartContainer.tsx').default;
const chartProps={stats:[],navStats:[{id:'pts',label:'PTS'}],playerId:1,playerName:'Jugador QA',playerPosition:'G',opponent:'BKN',asOfDate:date};
await check('Gráfico real filtra defensa antes de elegir L5',()=>{const tree=chart(chartProps),data=nodes(tree).find(n=>n.type==='PlayerChart').props.data;assert.equal(data.length,5);assert.ok(data.every(r=>r.opponent===top.team));assert.equal(data.at(-1).value,7);});
await check('Carga y fallo de referencia no muestran resultados sin filtrar',()=>{for(const change of ['loading','error']){defenseLoading=change==='loading';defenseError=change==='error'?'falló':null;const tree=chart(chartProps);assert.equal(nodes(tree).find(n=>n.type==='PlayerChart'),undefined);assert.ok(nodes(tree).some(n=>n.props?.role===(change==='loading'?'status':'alert')));}defenseLoading=false;defenseError=null;});
let sample;const withSample={...chartProps,onAnalysisSampleChange:s=>sample=s};
await check('Filtro defensivo deshabilita evaluación predictiva retrospectiva',()=>{const custom=loader({...stubs,react:{...react,useLayoutEffect:f=>f()},'next/navigation':{usePathname:()=>'/players/1',useSearchParams:()=>new URLSearchParams('defBand=high&defSeason=2026-27&defPosition=G&n=5')},'@/hooks/useAnalysisQuery':{useAnalysisQuery:url=>url?.startsWith('/api/nba-defense')?{data:report(),loading:false,error:null}:url==='/api/player-history'?{data:{games:history},loading:false,error:null}:{data:null,loading:false,error:null}},'./useAnalysisQuery':{useAnalysisQuery:()=>({data:report(),loading:false,error:null})}})('./components/PlayerChartContainer.tsx').default;custom(withSample);assert.equal(sample.outcomeFiltered,true);assert.ok(sample.labels.some(x=>x.includes('Defensa:')));});

const jornadaData={ok:true,date,market:'pts',generatedAt:'2026-10-30T17:00:00Z',rosterAt:date,archiveId:'a'.repeat(64),history:'ready',quotes:'ready',games:[{id:'1',away:'ATL',home:top.team,start:null,status:1},{id:'2',away:'ATL',home:bottom.team,start:null,status:1}],players:[{id:1,name:'Jugador permisiva',team:'ATL',opponent:top.team,gameId:'1',position:'G',values:[10],minutes:[30],dates:['2026-10-24'],seasons:['2026-27'],quotes:[]},{id:2,name:'Jugador restrictiva',team:'ATL',opponent:bottom.team,gameId:'2',position:'G',values:[10],minutes:[30],dates:['2026-10-24'],seasons:['2026-27'],quotes:[]}],warnings:[]};
function jornadaHTML(band,def=report()){
 let index=0;const UI=loader({'react':{...react,useState:initial=>{index++;return[index===16?band:typeof initial==='function'?initial():initial,()=>{}];}},'next/link':({children,href,...p})=>jsx('a',{...p,href,children}),'@/hooks/useAnalysisQuery':{useAnalysisQuery:url=>({data:url.startsWith('/api/nba-jornada')?jornadaData:def,loading:false,error:null})}})('./app/trending/JornadaExplorer.tsx').default;
 return DOM.renderToStaticMarkup(jsx(UI,{initialDate:date,storageKey:'qa'}));
}
await check('Jornada real muestra referencia defensiva sin cambiar cuotas ni selecciones',()=>{const html=jornadaHTML('all');assert.match(html,/Jugador permisiva/);assert.match(html,/Jugador restrictiva/);assert.match(html,/Defensa de la jornada/);assert.match(html,/Defensa .*: 1º\/30/);});
await check('Jornada filtra por posición y permite retirar un filtro sin referencia',()=>{assert.doesNotMatch(jornadaHTML('high'),/Jugador restrictiva/);assert.match(jornadaHTML('low'),/Jugador restrictiva/);const html=jornadaHTML('high',null);assert.match(html,/referencia defensiva no está disponible/);assert.match(html,/Quitar filtro defensivo/);assert.doesNotMatch(html,/Jugador permisiva/);});
await check('Comparación con/sin no ignora silenciosamente un filtro defensivo activo',()=>{const tree=chart(chartProps),props=nodes(tree).find(n=>n.type==='PlayerAbsenceFilter').props;assert.equal(props.comparison.unsupportedFilters,true);});
const legacy=loader({'next/server':{NextResponse:{json:(data,init={})=>({data,status:init.status??200})}},'@/lib/auth/server':{withAuth:fn=>fn},'@/lib/nbaDefenseData':{getDefenseReport:async s=>report({settings:s,rankings:d.defenseRankings(fixture.games,s)})}})('./app/api/dvp/route.ts');
await check('DVP existente reutiliza archivo y devuelve faltantes sin favorabilidad falsa',async()=>{const r=await legacy.GET(new Request('https://example.invalid/api/dvp?team=BKN&position=G'));assert.equal(r.status,200);assert.equal(r.data.metrics.length,4);assert.ok(r.data.metrics.every(m=>m.favorable===null));assert.equal(r.data.scope,'FULL');assert.equal((await legacy.GET(new Request('https://example.invalid/api/dvp?team=XXX'))).status,400);});

const result={package:'nba-defensas-contexto-v1',ok:true,checks:fixture.checks+checks.length,python:fixture.tests,frontend:checks,fixtures:true,network:false,database:false};fs.mkdirSync('maintenance-state/qa',{recursive:true});fs.writeFileSync('maintenance-state/qa/defensas-v1.json',JSON.stringify(result,null,2),{mode:0o600});console.log(`\nDefensas: ${result.checks} verificaciones correctas. Sin red ni base de datos.`);
