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
  vm.runInNewContext(output,{module,exports:module.exports,require:n=>n in overrides?overrides[n]:n.startsWith('.')?load(path.resolve(path.dirname(file),n)):load(n),console,Date,Number,Map,Set,URL,crypto,URLSearchParams,AbortController,fetch:()=>{throw Error('Red desactivada');},...overrides.__globals},{filename:path.relative(root,file)});
  return module.exports;
 }return load;
}
function nodes(t){return !t||typeof t!=='object'?[]:[t,...[t.props?.children].flat(Infinity).flatMap(nodes)];}
function find(t,type){return nodes(t).find(n=>n.type===type);}
function text(t){return t==null||typeof t==='boolean'?'':typeof t!=='object'?String(t):[t.props?.children].flat(Infinity).map(text).join('');}
const load=loader(),n=load('./lib/playerNavigation.ts'),d=load('./lib/ticketReader/draft.ts'),model=load('./lib/ticketReader/model.ts');
const now=Date.parse('2026-10-30T17:00:00Z'),ctx=n.parseGameContext(new URLSearchParams({game:'CLE-ATL',date:'2026-10-30',start:'2026-10-31T00:00:00Z'}));
const quote={player_name:'Jugador QA',prop_type:'AST',scope:'Q1',line:2.5,matchup:'CLE @ ATL',book:'stake',over_price:1.8,under_price:1.9,updated_at:'2026-10-30T14:00:00Z',event_date:'2026-10-30'};
const input={playerId:1,playerName:'Jugador QA',team:'ATL',stat:'ast',scope:'Q1',side:'under',line:2.5,context:ctx,date:'2026-10-30',book:'stake',quotes:[quote]};
const leg=()=>n.selectionFromPage(input,new Date(now));
function memory(){const values=new Map();return{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),values};}
await check('Partido conserva ambos equipos, fecha y hora argentina',()=>{assert.equal(ctx.away,'CLE');assert.equal(ctx.home,'ATL');assert.match(ctx.returnTo,/date=2026-10-30/);assert.equal(ctx.start,'2026-10-31T00:00:00Z');});
await check('Contextos inválidos no inventan un partido',()=>{for(const p of[{game:'CLE-CLE',date:'2026-10-30'},{game:'CLE-XXX',date:'2026-10-30'},{game:'CLE-ATL',date:'2026-02-30'},{game:'CLE-ATL',date:'not-date'}])assert.equal(n.parseGameContext(new URLSearchParams(p)),null);});
await check('Hora de otra fecha y fechas sin zona no se conservan como horario',()=>{assert.equal(n.validStart('2026-10-30T00:00:00Z','2026-10-30'),undefined);assert.equal(n.validStart('2026-10-30T22:00:00','2026-10-30'),undefined);});
await check('Jugador mantiene contexto desde el partido y el plantel del mismo encuentro',()=>{assert.match(n.playerGameHref(1,ctx,'ATL'),/game=CLE-ATL/);assert.equal(n.playerGameHref(2,ctx,'LAL'),'/players/2');assert.equal(n.playerGameHref('../bad',ctx),'/');});
await check('Volver al partido conserva filtros seguros, sin destinos externos',()=>{const p=new URLSearchParams({game:'CLE-ATL',date:'2026-10-30',from:'/partidos/CLE-ATL?date=2026-10-30&season=2026-27&phase=ALL&next=https://evil.invalid'});const c=n.parseGameContext(p);assert.match(c.returnTo,/season=2026-27/);assert.ok(!c.returnTo.includes('evil'));assert.ok(!n.safePlayerHref('https://evil.invalid/players/1'));assert.ok(!n.safePlayerHref('//evil.invalid/players/1'));assert.ok(!n.safePlayerHref('/players/1\\evil'));});
await check('Compartir conserva el evento sin incorporar parámetros ajenos',()=>{const p=new URLSearchParams({stat:'ast',side:'under'});n.putGameContext(p,ctx);assert.equal(p.get('date'),'2026-10-30');assert.match(n.safePlayerHref('/players/1?'+p),/stat=ast/);});
await check('Selección transporta jugador, mercado, período, lado, línea, casa y cuota',()=>{const l=leg();assert.equal(l.playerId,1);assert.equal(l.market,'AST');assert.equal(l.scope,'Q1');assert.equal(l.operator,'under');assert.equal(l.line,2.5);assert.equal(l.book,'stake');assert.equal(l.odds,1.9);assert.equal(l.playerTeam,'ATL');assert.equal(l.confirmed,false);assert.equal(l.teamConfirmed,false);assert.equal(l.quoteCapturedAt,new Date(quote.updated_at).toISOString());});
await check('Cuotas de otra fecha, rival, período, mercado o lado no se reutilizan',()=>{for(const change of[{event_date:'2026-10-31'},{matchup:'CLE vs LAL'},{scope:'FULL'},{prop_type:'PTS'},{under_price:null},{updated_at:'2026-11-01T00:00:00Z'}]){const l=n.selectionFromPage({...input,quotes:[{...quote,...change}]},new Date(now));assert.equal(l.odds,null);assert.equal(l.book,'stake');}});
await check('Sin casa elegida no se elige una cuota por el usuario',()=>{assert.equal(n.selectionFromPage({...input,book:null},new Date(now)).odds,null);assert.equal(n.selectionFromPage({...input,book:null},new Date(now)).book,'unknown');});
await check('La fecha explícita nunca cae en cuotas de otro encuentro próximo',()=>{assert.equal(n.contextualOddsEvent([{...quote,event_date:'2026-10-31'}],ctx),'');});
await check('Mercados inválidos, línea y jugador malformados se rechazan',()=>{for(const change of[{stat:'usage_pct'},{line:NaN},{line:301},{playerId:'../x'},{playerName:''}])assert.throws(()=>n.selectionFromPage({...input,...change},new Date(now)));});
await check('Borrador se acumula y persiste sin duplicar la selección',()=>{const st=memory(),a=d.appendDraft(st,'user-A',leg(),'/players/1',now),b=d.appendDraft(st,'user-A',leg(),'/players/1',now);assert.equal(a.draft.document.legs.length,1);assert.equal(b.duplicate,true);assert.equal(b.draft.document.legs.length,1);const extra=n.selectionFromPage({...input,playerId:2,playerName:'Otro QA'},new Date(now));assert.equal(d.appendDraft(st,'user-A',extra,'/players/2',now).draft.document.legs.length,2);});
await check('Selección repetida actualiza su precio conservando el identificador',()=>{const st=memory(),a=d.appendDraft(st,'u',leg(),'/players/1',now),l={...leg(),odds:2.1};const b=d.appendDraft(st,'u',l,'/players/1',now);assert.equal(b.draft.document.legs[0].id,a.draft.document.legs[0].id);assert.equal(b.draft.document.legs[0].odds,2.1);});
await check('No mezcla fechas ni descarta el borrador anterior',()=>{const st=memory();d.appendDraft(st,'u',leg(),'/players/1',now);const before=st.getItem(d.draftKey('u'));assert.throws(()=>d.appendDraft(st,'u',{...leg(),eventDate:'2026-10-31'},'/players/1',now),/DRAFT_DATE_CONFLICT/);assert.equal(st.getItem(d.draftKey('u')),before);});
await check('Límite de cuarenta selecciones sin sobrescribir el contenido',()=>{const st=memory();for(let i=1;i<=40;i++)d.appendDraft(st,'u',{...leg(),playerId:i},'/players/1',now);const before=st.getItem(d.draftKey('u'));assert.throws(()=>d.appendDraft(st,'u',{...leg(),playerId:41},'/players/1',now),/DRAFT_FULL/);assert.equal(st.getItem(d.draftKey('u')),before);});
await check('Usuarios diferentes mantienen borradores separados',()=>{const st=memory();d.appendDraft(st,'user-A',leg(),'/players/1',now);assert.equal(d.readDraft(st,'user-B',now),null);});
await check('Edición de otra pestaña no se pisa con una revisión anterior',()=>{const st=memory(),a=d.appendDraft(st,'u',leg(),'/players/1',now).draft;const b=d.saveDraft(st,'u',{...a.document,title:'Cambio de otra pestaña'},a.revision,'/players/1',now);assert.throws(()=>d.saveDraft(st,'u',a.document,a.revision,'/players/1',now),/DRAFT_CONFLICT/);assert.equal(d.readDraft(st,'u',now).revision,b.revision);});
await check('Recargar no restaura confirmaciones ni resultados antiguos',()=>{const st=memory(),l={...leg(),confirmed:true,teamConfirmed:true,raw:'texto privado del ticket',extra:'no exportar'};d.appendDraft(st,'u',l,'/players/1',now);const clean=d.readDraft(st,'u',now).document.legs[0];assert.equal(clean.confirmed,false);assert.equal(clean.teamConfirmed,false);assert.equal(clean.raw,'');assert.ok(!('extra'in clean));});
await check('Ticket JSON puede reimportarse y exige nueva confirmación',()=>{const st=memory(),saved=d.appendDraft(st,'u',leg(),'/players/1',now);const output=JSON.parse(d.exportDraftDocument(saved.draft.document));const parser=load('./lib/ticketReader/parser.ts');assert.equal(parser.importTicket(output).legs[0].confirmed,false);assert.equal(output.legs[0].scope,'Q1');assert.equal(output.legs[0].odds,1.9);});
await check('Borradores vencidos no se cargan y contenidos corruptos no se sobrescriben',()=>{const st=memory();d.appendDraft(st,'u',leg(),'/players/1',now);assert.equal(d.readDraft(st,'u',now+15*86400000),null);st.setItem(d.draftKey('bad'),'{broken');assert.throws(()=>d.readDraft(st,'bad',now));assert.throws(()=>d.saveDraft(st,'bad',modelDocument(),null,null,now));assert.equal(st.getItem(d.draftKey('bad')),'{broken');});
function modelDocument(){return{version:1,title:'Mi ticket',eventDate:'2026-10-30',totalOdds:null,legs:[leg()],warnings:[]};}
await check('El borrador no guarda destinos externos ni crea identidades repetidas',()=>{const doc=modelDocument();doc.legs.push({...leg(),id:doc.legs[0].id});const st=memory(),saved=d.saveDraft(st,'u',doc,null,'https://evil.invalid',now);assert.equal(saved.returnTo,null);assert.equal(new Set(saved.document.legs.map(l=>l.id)).size,2);});
await check('Hitos del analizador se abren en la ficha con su línea equivalente',()=>{const href=n.selectionPlayerHref({...leg(),operator:'at_least',line:4});assert.match(href,/line=3.5/);assert.match(href,/game=CLE-ATL/);assert.match(href,/scope=Q1/);});
// Route-level tests: no real calendar, database, credentials or network.
let queried=0,allowed=true,wrapped=0;
let schedule={available:true,games:[{id:'1',away:'CLE',home:'ATL'},{id:'2',away:'LAL',home:'DEN'}]};
const route=loader({'@/lib/auth/server':{withAuth:fn=>{wrapped++;return async req=>allowed?fn(req):{status:401};}},'next/server':{NextResponse:{json:(data,options={})=>({data,status:options.status??200,headers:options.headers??{}})}},'@/lib/currentRosters':{CURRENT_ROSTER_UPDATED_AT:'2026-10-26',getCurrentRosterPlayer:id=>id===1?{team_abbreviation:'ATL'}:null},'@/lib/ticketReader/calendar':{ticketSchedule:async()=>{queried++;return schedule;}}})('./app/api/ticket-reader/context/route.ts');
const req=q=>({url:'http://local.invalid/api/ticket-reader/context?'+new URLSearchParams(q)});
await check('Calendario autenticado: una lectura acotada y solo partidos de su equipo',async()=>{assert.equal(wrapped,1);const r=await route.GET(req({playerId:'1',date:'2026-10-30'}));assert.equal(r.status,200);assert.equal(r.data.team,'ATL');assert.equal(r.data.games.length,1);assert.equal(r.data.games[0].away,'CLE');assert.equal(r.headers['Cache-Control'],'private, no-store');assert.equal(queried,1);});
await check('No consulta calendario para IDs o fechas inválidos',async()=>{const before=queried;for(const q of[{playerId:'bad',date:'2026-10-30'},{playerId:'1',date:'2026-02-30'}])assert.equal((await route.GET(req(q))).status,400);assert.equal(queried,before);});
await check('Un plantel fuera de vigencia o desconocido no completa equipos',async()=>{const before=queried;for(const q of[{playerId:'1',date:'2025-10-30'},{playerId:'999',date:'2026-10-30'}]){const r=await route.GET(req(q));assert.equal(r.data.verified,false);assert.equal(r.data.games.length,0);}assert.equal(queried,before);});
await check('Partidos ambiguos y calendario caído quedan disponibles para revisión',async()=>{schedule={available:true,games:[{id:'1',away:'CLE',home:'ATL'},{id:'3',away:'ATL',home:'CHI'}]};assert.equal((await route.GET(req({playerId:'1',date:'2026-10-30'}))).data.games.length,2);schedule={available:false,games:[]};const r=await route.GET(req({playerId:'1',date:'2026-10-30'}));assert.equal(r.data.verified,false);assert.match(r.data.message,/manualmente/);});
await check('Sin sesión no se consulta el calendario',async()=>{const before=queried;allowed=false;assert.equal((await route.GET(req({playerId:'1',date:'2026-10-30'}))).status,401);assert.equal(queried,before);});
const fixture=[{player_id:1,game_id:'3',game_date:'2026-10-31',pts:99},{player_id:1,game_id:'2',game_date:'2026-10-30',pts:88},{player_id:1,game_id:'1',game_date:'2026-10-29',pts:20}];
const history=loader({'./nbaArchive':{archiveEnabled:()=>true,archivedPlayer:async()=>fixture},'@/lib/prisma':{}})('./lib/playerHistory.ts');
await check('El partido transportado excluye su propio día y resultados futuros',async()=>{const r=await history.getPlayerHistoricalExplorer({playerId:1,market:'PTS',line:20.5,phase:'ALL',mode:'all',asOfDate:'2026-10-30'});assert.equal(r.games.length,1);assert.equal(r.games[0].value,20);assert.equal(r.summary.avg,20);});
await check('La consulta habitual sin fecha mantiene el histórico completo',async()=>{const r=await history.getPlayerHistoricalExplorer({playerId:1,market:'PTS',line:20.5,phase:'ALL',mode:'all'});assert.equal(r.games.length,3);});
await check('La cuota elegida no se atribuye a un rival o día incompleto',()=>{assert.equal(n.selectionFromPage({...input,context:null},new Date(now)).odds,null);});
const report={package:'nba-conexion-analizador-v1',ok:true,checks:checks.length,tests:checks,fixtures:true,network:false,database:false};
const output=path.join(root,'maintenance-state/qa/conexion-analizador-v1.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});
console.log(`\nConexión con analizador: ${checks.length} verificaciones correctas. Informe privado: ${path.relative(root,output)}. Sin red ni base de datos.`);
