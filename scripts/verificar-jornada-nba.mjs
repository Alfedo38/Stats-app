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
  vm.runInNewContext(output,{module,exports:module.exports,require:n=>n in overrides?overrides[n]:n.startsWith('.')?load(path.resolve(path.dirname(file),n)):load(n),console,Date,Number,Map,Set,URL,crypto,URLSearchParams,AbortController,Object,Intl,fetch:()=>{throw Error('Red desactivada');},...overrides.__globals},{filename:path.relative(root,file)});
  return module.exports;
 }return load;
}
function nodes(t){return !t||typeof t!=='object'?[]:[t,...[t.props?.children].flat(Infinity).flatMap(nodes)];}
function find(t,type){return nodes(t).find(n=>n.type===type);}
function text(t){return t==null||typeof t==='boolean'?'':typeof t!=='object'?String(t):[t.props?.children].flat(Infinity).map(text).join('');}
const load=loader(),j=load('./lib/nbaJornada.ts'),draft=load('./lib/ticketReader/draft.ts');
const now=new Date('2026-10-30T17:00:00Z'),date='2026-10-30',game={id:'0022600099',away:'CLE',home:'ATL',start:'2026-10-31T00:00:00.000Z',status:1};
const fact=(id,change={})=>({player_id:1,game_id:String(22600000+id),game_date:`2026-10-${String(30-id).padStart(2,'0')}`,season_type:'Regular Season',season_id:'2026-27',min:30,pts:20,reb:7,ast:4,fg3m:2,fg3a:8,fta:6,...change});
const raw=(change={})=>({book:'stake',jugador:'Jugador QA',player_norm:'jugador qa',stat_key:'PTS',side:'over',model_line:19.5,odds_decimal:1.9,game_norm:'CLE-ATL',event_date:date,period_scope:'FULL',scraped_at_utc:'2026-10-30T14:00:00Z',...change});
const p=(change={})=>({id:1,name:'Jugador QA',team:'ATL',opponent:'CLE',gameId:game.id,position:'G',...j.recentSample(Array.from({length:10},(_,i)=>fact(i+1)),1,date,'pts'),quotes:j.jornadaQuotes([raw()], 'Jugador QA',game,date,'pts',now),...change});
await check('Hoy se interpreta en Argentina aunque UTC ya sea otro día',()=>{assert.equal(j.argDate(new Date('2026-10-31T01:00:00Z')),date);assert.equal(j.jornadaDateAllowed(date,now),true);assert.equal(j.jornadaDateAllowed('2026-11-06',now),true);for(const d of ['2026-10-29','2026-11-07','2026-02-30','bad'])assert.equal(j.jornadaDateAllowed(d,now),false);});
await check('Mercados permitidos distinguen triples anotados e intentados y FTA',()=>{for(const m of ['pts','fg3m','fg3a','fta','fga'])assert.equal(j.marketIsValid(m),true);for(const m of ['__proto__','constructor','bad',null])assert.equal(j.marketIsValid(m),false);});
await check('Calendario conserva visitante, local y horario argentino',()=>{const g=j.normalizedGame({nba_game_id:game.id,away:'CLE',home:'ATL',start_utc:game.start,status_id:1},date);assert.equal(g.start,game.start);assert.equal(g.away,'CLE');assert.equal(g.home,'ATL');assert.equal(j.normalizedGame({nba_game_id:'1',away:'CLE',home:'CLE'},date),null);assert.equal(j.normalizedGame({nba_game_id:'1',away:'CLE',home:'XXX'},date),null);assert.equal(j.normalizedGame({nba_game_id:'1',away:'CLE',home:'ATL',postponed:true},date),null);});
await check('Una hora de otra fecha o sin zona queda S/D',()=>{for(const start of ['2026-10-30T01:00:00Z','2026-10-30T22:00:00','bad'])assert.equal(j.normalizedGame({nba_game_id:'1',away:'CLE',home:'ATL',start_utc:start},date).start,null);});
await check('La muestra excluye al propio día, futuros y otra identidad',()=>{const r=j.recentSample([fact(0),fact(-1,{game_date:'2026-10-31'}),fact(1),fact(2,{player_id:2})],1,date,'pts');assert.equal(r.values.length,1);assert.equal(r.dates[0],'2026-10-29');});
await check('Duplicados con ceros iniciales no aumentan la muestra',()=>{const r=j.recentSample([fact(1),fact(1,{game_id:'000'+fact(1).game_id})],1,date,'pts');assert.equal(r.values.length,1);});
await check('Solo regular y playoffs: pretemporada no aporta datos',()=>{const r=j.recentSample([fact(1,{season_type:'Preseason'}),fact(2,{season_type:'Playoffs'}),fact(3,{season_type:'Play-In'}),fact(4,{season_type:null,game_id:'0022600001'})],1,date,'pts');assert.equal(r.values.length,2);});
await check('Un parcial no se interpreta como partido completo',()=>{assert.equal(j.recentSample([fact(1,{period_scope:'Q1',pts:5})],1,date,'pts').values.length,0);});
await check('El resumen selecciona hasta diez partidos y ordena por fecha',()=>{const r=j.recentSample(Array.from({length:15},(_,i)=>fact(i+1)).reverse(),1,date,'pts');assert.equal(r.values.length,10);assert.equal(r.dates[0],'2026-10-29');assert.equal(r.dates[9],'2026-10-20');});
await check('Cero confirmado se conserva; vacíos, booleanos y ausentes no son cero',()=>{const r=j.recentSample([fact(1,{pts:0}),fact(2,{pts:null}),fact(3,{pts:''}),fact(4,{pts:false})],1,date,'pts');assert.equal(r.values[0],0);assert.deepEqual(JSON.parse(JSON.stringify(r.values.slice(1))),[null,null,null]);});
await check('Combos incompletos conservan el dato ausente',()=>{const r=j.recentSample([fact(1),fact(2,{ast:null})],1,date,'pra');assert.equal(r.values[0],31);assert.equal(r.values[1],null);});
await check('FGA, 3PA y FTA usan su volumen correspondiente',()=>{for(const [m,v] of [['fga',18],['fg3a',8],['fta',6]])assert.equal(j.recentSample([fact(1,{fga:18})],1,date,m).values[0],v);});
await check('Minutos admiten MM:SS, preservan ausente y excluyen DNP con cero',()=>{const r=j.recentSample([fact(1,{min:'35:30'}),fact(2,{min:null}),fact(3,{min:0})],1,date,'pts');assert.equal(r.minutes[0],35.5);assert.equal(r.minutes[1],null);assert.equal(r.values.length,2);});
await check('Muestra pequeña tiene su denominador y vacío permanece S/D',()=>{const player=p({values:[20,null,0],minutes:[30,null,10]});const s=j.summaryFor(player,10,19.5,'over');assert.equal(s.stat.valid,2);assert.equal(s.stat.total,3);assert.equal(s.stat.hits,1);assert.equal(s.stat.rate,50);assert.equal(s.minutes.average,20);assert.equal(j.summaryFor(p({values:[]}),10,20,'over').stat.average,null);});
await check('Under usa su lado y excluye empates de los decididos',()=>{const player=p({values:[19,20,21]});const a=j.summaryFor(player,5,20,'over').stat,b=j.summaryFor(player,5,20,'under').stat;assert.equal(a.hits,1);assert.equal(b.hits,1);assert.equal(b.pushes,1);assert.equal(b.decided,2);assert.equal(b.rate,50);});
await check('Sin línea no aparece un porcentaje histórico',()=>{const s=j.summaryFor(p(),10,null,'over').stat;assert.equal(s.rate,null);});
await check('Precio exige la misma fecha, rival, mercado, período y casa',()=>{for(const change of [{event_date:'2026-10-31'},{game_norm:'CLE-LAL'},{stat_key:'REB'},{period_scope:'Q1'},{book:'otro'},{league:'WNBA'},{jugador:'Otro QA'},{scraped_at_utc:null}])assert.equal(j.jornadaQuotes([raw(change)],'Jugador QA',game,date,'pts',now).length,0);});
await check('Nombre invertido exacto se acepta sin confundir sufijos',()=>{assert.equal(j.jornadaQuotes([raw({jugador:'QA, Jugador'})],'Jugador QA',game,date,'pts',now).length,1);assert.equal(j.jornadaQuotes([raw({jugador:'Jugador QA Jr.'})],'Jugador QA',game,date,'pts',now).length,0);});
await check('Retirada reciente no resucita una cuota vieja',()=>{assert.equal(j.jornadaQuotes([raw(),raw({scraped_at_utc:'2026-10-30T15:00:00Z',active:false})],'Jugador QA',game,date,'pts',now).length,0);});
await check('Dos precios contradictorios a la misma hora quedan sin cuota',()=>{assert.equal(j.jornadaQuotes([raw(),raw({odds_decimal:2.1})],'Jugador QA',game,date,'pts',now).length,0);});
await check('Captura futura no se incorpora como precio actual',()=>{assert.equal(j.jornadaQuotes([raw({scraped_at_utc:'2026-10-30T17:01:00Z'})],'Jugador QA',game,date,'pts',now).length,0);});
await check('Hito inclusivo se convierte a la línea equivalente de conteo',()=>{const q=j.jornadaQuotes([raw({side:'at_least',model_line:20})],'Jugador QA',game,date,'pts',now);assert.equal(q.length,1);assert.equal(q[0].line,19.5);assert.equal(q[0].over_price,1.9);assert.equal(q[0].under_price,null);});
await check('Capturas distintas de Over y Under conservan su fecha propia',()=>{const player=p({quotes:j.jornadaQuotes([raw(),raw({side:'under',odds_decimal:1.8,scraped_at_utc:'2026-10-30T15:00:00Z'})],'Jugador QA',game,date,'pts',now)});assert.equal(j.quoteAt(player,'stake',19.5,'over').capturedAt,'2026-10-30T14:00:00.000Z');assert.equal(j.quoteAt(player,'stake',19.5,'under').capturedAt,'2026-10-30T15:00:00.000Z');assert.equal(j.jornadaLeg(player,game,date,'pts',19.5,'over','stake',now).quoteCapturedAt,'2026-10-30T14:00:00.000Z');});
await check('Elegir casa copia su precio; sin elegirla solo copia selección',()=>{assert.equal(j.jornadaLeg(p(),game,date,'pts',19.5,'over','stake',now).odds,1.9);assert.equal(j.jornadaLeg(p(),game,date,'pts',19.5,'over',null,now).odds,null);assert.equal(j.jornadaLeg(p(),game,date,'pts',20.5,'over','stake',now).odds,null);});
await check('No hay precio Under si solo existe Over ni precio para otra línea',()=>{assert.equal(j.quoteAt(p(),'stake',19.5,'under'),null);assert.equal(j.quoteAt(p(),'stake',20.5,'over'),null);assert.equal(j.availableLines(p(),'betano','over').length,0);});
await check('Enlace a ficha conserva contexto y selección completa',()=>{const href=j.jornadaPlayerHref(p(),game,date,'fg3a',6.5,'under'),q=new URL(href,'http://local.invalid').searchParams;assert.equal(q.get('game'),'CLE-ATL');assert.equal(q.get('date'),date);assert.equal(q.get('stat'),'fg3a');assert.equal(q.get('line'),'6.5');assert.equal(q.get('side'),'under');assert.equal(q.get('scope'),'FULL');});
await check('Dos selecciones se acumulan sin analizar ni duplicarse',()=>{const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},leg=j.jornadaLeg(p(),game,date,'pts',19.5,'over','stake',now);draft.appendDraft(storage,'u',leg,'/players/1',+now);draft.appendDraft(storage,'u',leg,'/players/1',+now);const saved=draft.appendDraft(storage,'u',{...leg,playerId:2,playerName:'Otro QA'},'/players/2',+now);assert.equal(saved.draft.document.legs.length,2);assert.equal(saved.draft.document.legs[0].confirmed,false);});

// Render the actual component with controlled hook state. No browser, login or external server.
const reactDOM=require('react-dom/server'),jsx=require('react/jsx-runtime').jsx;
const uiData={ok:true,date,market:'pts',generatedAt:now.toISOString(),rosterAt:date,archiveId:'a'.repeat(64),history:'ready',quotes:'ready',games:[game],players:[p()],warnings:[]};
function renderUI({data=uiData,loading=false,error=null,state={}}={}){
 let index=0;
 const component=loader({'react':{...react,useState:initial=>{index++;return [index in state?state[index]:typeof initial==='function'?initial():initial,()=>{}];}},'next/link':({children,href,...props})=>jsx('a',{...props,href,children}),'@/hooks/useAnalysisQuery':{useAnalysisQuery:()=>({data,loading,error})}})('./app/trending/JornadaExplorer.tsx').default;
 return reactDOM.renderToStaticMarkup(jsx(component,{initialDate:date,storageKey:'qa-user'}));
}
await check('Pantalla real conserva identidad, muestra y los accesos a ficha/analizador',()=>{const html=renderUI();assert.match(html,/Jugador QA/);assert.match(html,/L5 · 5\/5/);assert.match(html,/L10 · 10\/10/);assert.match(html,/Al analizador/);assert.match(html,/game=CLE-ATL/);assert.match(html,/aria-label="Mercado"/);});
await check('Render sin muestra no muestra un porcentaje ni minutos inventados',()=>{const html=renderUI({data:{...uiData,players:[p({values:[],minutes:[],dates:[]})]}});assert.match(html,/L10 · 0\/10/);assert.match(html,/S\/D/);assert.doesNotMatch(html,/>0%<|Lean Under/);});
await check('Filtro Under renderiza el lado y su acierto propio',()=>{const html=renderUI({data:{...uiData,players:[p({values:[10,20,30]})]},state:{6:'under',11:{[date+':pts:under:all:'+game.id+':1']:{line:19.5,book:null}}}});assert.match(html,/Menos de/);assert.match(html,/33%/);assert.match(html,/1\/3 decididos/);});
await check('Un día sin partidos y un error de carga tienen mensajes distintos',()=>{assert.match(renderUI({data:{...uiData,games:[],players:[]}}),/No hay partidos en el calendario/);assert.match(renderUI({data:null,error:'Calendario de prueba no disponible'}),/Reintentar/);assert.doesNotMatch(renderUI({data:null,error:'Calendario de prueba no disponible'}),/Jugador QA/);});
await check('Cambiar de consulta muestra carga sin arrastrar resultados anteriores',()=>{const html=renderUI({data:null,loading:true});assert.match(html,/Cargando partidos/);assert.doesNotMatch(html,/Jugador QA|Al analizador/);});

// Exercise the real data adapter with in-memory sports fixtures, no network or credentials.
let dbReads=0,archiveReads=0,failPrices=false,failSchedule=false,failArchive=false,stale=false;
const server=loader({'server-only':{},'./prisma':{$queryRawUnsafe:async(sql,...args)=>{dbReads++;assert.ok(!/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(sql));if(sql.includes('nba_daily_schedule')){if(failSchedule)throw Error('secret-db-url');assert.match(sql,/event_date=\$1::date/);assert.match(sql,/LIMIT 41/);return[{nba_game_id:game.id,away:'CLE',home:'ATL',start_utc:game.start,status_id:1}];}assert.match(sql,/LIMIT 12001/);if(failPrices)throw Error('secret-price-url');return[{row:raw()}];}},'./nbaArchive':{archiveEnabled:()=>true,archiveManifest:async()=>{archiveReads++;if(failArchive)throw Error('secret-bucket-url');return{id:'a'.repeat(64)};},archivePart:async()=>({recent:{1:Array.from({length:10},(_,i)=>fact(i+1))}})},'./currentRosters':{CURRENT_ROSTER_UPDATED_AT:'2026-10-26',getCurrentRosterPlayers:()=>[{player_id:1,full_name:'Jugador QA',team_abbreviation:'ATL',position:'G'},{player_id:2,full_name:'Sin Muestra',team_abbreviation:'CLE',position:'C'}]},'./ticketReader/teamContext':{rosterFitsDate:()=>!stale}})('./lib/nbaJornadaData.ts');
await check('Adaptador hace dos consultas acotadas y una lectura del índice histórico',async()=>{const data=await server.getJornada(date,'pts');assert.equal(dbReads,2);assert.equal(archiveReads,1);assert.equal(data.players.length,2);assert.equal(data.players[0].values.length,10);assert.equal(data.players[1].values.length,0);assert.equal(data.archiveId,'a'.repeat(64));});
await check('Visitas repetidas comparten la caché de un minuto',async()=>{const [a,b]=await Promise.all([server.getJornada(date,'pts'),server.getJornada(date,'pts')]);assert.equal(a,b);assert.equal(dbReads,2);});
await check('Cuotas caídas conservan jugadores e histórico y muestran aviso',async()=>{failPrices=true;const data=await server.getJornada(date,'reb');assert.equal(data.quotes,'unavailable');assert.equal(data.players.length,2);assert.equal(data.history,'ready');assert.equal(data.players[0].quotes.length,0);assert.ok(data.warnings.length);failPrices=false;});
await check('Archivo caído deja estadísticas vacías y conserva calendario',async()=>{failArchive=true;const data=await server.getJornada(date,'ast');assert.equal(data.history,'unavailable');assert.equal(data.players.length,2);assert.equal(data.players[0].values.length,0);assert.equal(data.archiveId,null);assert.ok(!JSON.stringify(data).includes('secret-'));failArchive=false;});
await check('Plantel fuera de vigencia no fabrica equipos o rivales',async()=>{stale=true;const before=dbReads;const data=await server.getJornada(date,'fg3a');assert.equal(data.players.length,0);assert.equal(data.games.length,1);assert.equal(dbReads-before,1);assert.ok(data.warnings.length);stale=false;});
await check('Caída de calendario falla sin publicar credenciales del error',async()=>{failSchedule=true;await assert.rejects(server.getJornada(date,'fta'),e=>e.status===503&&!e.message.includes('secret'));failSchedule=false;});
let allowed=true,calls=0;
class FixedDate extends Date{constructor(...args){super(...(args.length?args:[+now]));}static now(){return +now;}}
const route=loader({'@/lib/auth/server':{withAuth:fn=>async r=>allowed?fn(r):{status:401}},'next/server':{NextResponse:{json:(data,options={})=>({data,status:options.status??200,headers:options.headers??{}})}},'@/lib/nbaJornadaData':{JornadaError:server.JornadaError,getJornada:async()=>{calls++;return {ok:true};}},__globals:{Date:FixedDate}})('./app/api/nba-jornada/route.ts');
const req=q=>({url:'http://local.invalid/api/nba-jornada?'+new URLSearchParams(q)});
await check('La API requiere sesión y valida antes de consultar',async()=>{assert.equal((await route.GET(req({date,market:'pts'}))).status,200);assert.equal(calls,1);for(const q of [{date:'bad'},{date,market:'bad'},{date:'2025-10-30'}])assert.equal((await route.GET(req(q))).status,400);allowed=false;assert.equal((await route.GET(req({date}))).status,401);assert.equal(calls,1);});
await check('La API usa caché privada del navegador, sin respuesta pública',async()=>{allowed=true;const r=await route.GET(req({date}));assert.equal(r.headers['Cache-Control'],'private, no-store');});
const report={package:'nba-jornada-v1',ok:true,checks:checks.length,tests:checks,fixtures:true,network:false,database:false};
const output=path.join(root,'maintenance-state/qa/jornada-v1.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});
console.log(`\nJornada NBA: ${checks.length} verificaciones correctas. Informe: ${path.relative(root,output)}. Sin red ni base de datos.`);
