import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {parseArgs} from 'node:util';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';

const require=createRequire(import.meta.url),ts=require('typescript');
const React=require('react'),DOM=require('react-dom/server');
function loader(overrides={}) {
 const modules=new Map();
 function load(name) {
  if(Object.hasOwn(overrides,name))return overrides[name];
  if(name==='server-only')return {};
  if(name.endsWith('.css'))return Object.fromEntries(['card','header','why','unavailable','note','metrics','evidence','statDetail'].map(k=>[k,k]));
  const base=path.resolve(name.startsWith('@/')?name.slice(2):name);
  const file=[base,base+'.ts',base+'.tsx'].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());
  if(!file)return require(name);
  if(modules.has(file))return modules.get(file).exports;
  const module={exports:{}};modules.set(file,module);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{esModuleInterop:true,
   module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,Date,URL,URLSearchParams,
   require:n=>Object.hasOwn(overrides,n)?overrides[n]:n.startsWith('.')?load(path.join(path.dirname(file),n)):load(n)},{filename:file});
  return module.exports;
 }
 return load;
}
const load=loader(), model=load('lib/nbaMatchupFavorability.ts');
const {TEAMS,isDate}=load('lib/ticketReader/model.ts');
const window=load('lib/nbaHistoryWindow.ts');
const {values:opts}=parseArgs({options:{
 archivo:{type:'string'}, player:{type:'string',default:'1642264'}, team:{type:'string',default:'SAS'},
 rival:{type:'string',default:'SAC'}, date:{type:'string'}, position:{type:'string',default:'G'}, playoffs:{type:'boolean'},
}});

function printFromLocal() {
 const {archivo,player,team,rival,date,position}=opts;
 if(!/^[1-9]\d{0,9}$/.test(player)||!TEAMS.includes(team)||!TEAMS.includes(rival)||team===rival||!isDate(date))
  throw new Error('Usá --player <id> --team SAS --rival SAC --date YYYY-MM-DD (fecha NBA).');
 const root=fs.realpathSync(archivo), manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 if(manifest?.format!==1||!manifest.parts)throw new Error('No se reconoce el índice del archivo local.');
 function part(name) {
  const entry=manifest.parts[name];
  if(!entry)return null;
  if(!/^objects\/[A-Za-z0-9_./-]+\.json\.gz$/.test(entry.path)||entry.path.includes('..')||
      !Number.isSafeInteger(entry.bytes)||entry.bytes>49_000_000)throw new Error('Bloque local inválido: '+name);
  const file=fs.realpathSync(path.join(root,entry.path));
  if(!file.startsWith(root+path.sep))throw new Error('Ruta de bloque fuera del archivo.');
  const raw=fs.readFileSync(file);
  if(raw.length!==entry.bytes||createHash('sha256').update(raw).digest('hex')!==entry.sha256)
   throw new Error('El bloque no coincide con el índice: '+name);
  const value=JSON.parse(gunzipSync(raw,{maxOutputLength:65_000_000}));
  if(Object.keys(value).length!==entry.rows)throw new Error('Conteo de bloque inválido: '+name);
  return value;
 }
 const facts=part('facts/'+player);
 if(!Array.isArray(facts))throw new Error('No hay histórico local para ese jugador.');
 const snapshots=window.historySeasons(date).map(s=>part('defense/'+s));
 const result=model.matchupFavorability({playerId:Number(player),team,opponent:rival,cutoff:date,position,phase:opts.playoffs?'Playoffs':'Regular Season'},facts,snapshots);
 const fmt=(n,d=1)=>n==null?'—':n.toLocaleString('es-AR',{maximumFractionDigits:d,minimumFractionDigits:d});
 console.log(`Cruce local: ${player} · ${team} vs. ${rival} · corte NBA ${date} · ${result.season}`);
 for(const row of result.metrics){
  const {defense:d,validation:v}=row;
  console.log(`${row.stat.toUpperCase()}: base ${fmt(row.base?.value)} → ${fmt(row.adjusted)} · ${row.delta!==null&&row.delta>0?'+':''}${fmt(row.delta)} · ${row.kind==='estimate'?'estimación':row.kind==='scenario'?'escenario':'sin ajuste'}`);
  console.log(`  Base: ${row.base?.games??0} PJ. Defensa: ${d?`${d.games}/${d.total} PJ · ${d.teams} equipos · grupo ${d.group}`:'sin referencia suficiente'}. Validación: ${v.games} PJ · error ${fmt(v.referenceError,2)} → ${fmt(v.adjustedError,2)}.`);
 }
}

if(opts.archivo){
 try{printFromLocal();}catch(error){console.error('Favorabilidad: '+(error.code?'no se pudo leer el archivo local.':error.message));process.exitCode=1;}
}else{
 const phase='Regular Season',season='2026-27',playerId=1642264;
 const date=n=>new Date(Date.UTC(2026,9,18+n)).toISOString().slice(0,10);
 const pointLimit={pts:56,reb:20,ast:11};
 const gameId=(n,offset=0)=>'00226'+String(1000+n+offset).padStart(5,'0');
 const target={playerId,cutoff:date(48),phase,team:'SAS',opponent:'SAC',position:'PG'};
 const snapshot={format:1,scope:'FULL',season,games:TEAMS.flatMap((team,t)=>Array.from({length:52},(_,i)=>{
  const group=team==='SAC'?{pts:66,reb:17,ast:11}:team==='BOS'?{pts:46,reb:23,ast:11}:pointLimit;
  return {id:gameId(i,t*53),team,date:date(i),season,phase,groups:{G:group,ALL:{pts:group.pts+56,reb:group.reb+20,ast:group.ast+11}}};
 }))};
 const row=(n,other={})=>({game_id:gameId(n,3000),player_id:playerId,game_date:date(n),team_abbreviation:'SAS',
  opponent_abbr:n%2===0?'SAC':'BOS',min:30,period_scope:'FULL',season_type:phase,
  pts:n%2===0?23:17,reb:n%2===0?4:6,ast:7,...other});
 const history=Array.from({length:48},(_,i)=>row(i));
 const plain=x=>JSON.parse(JSON.stringify(x));
 async function check(name,test){await test();console.log('OK · '+name);}
 const calc=(facts=history,s=snapshot,t=target)=>model.matchupFavorability(t,facts,[s]);
 const get=(stat,result=calc())=>result.metrics.find(r=>r.stat===stat);

 await check('Puntos, rebotes y asistencias pueden tener tres lecturas distintas en el mismo partido',()=>{
  const pts=get('pts'),reb=get('reb'),ast=get('ast');
  assert.equal(pts.base.value,20);assert.equal(pts.defense.opponentAllowed,66);assert.equal(pts.defense.leagueAllowed,56);
  assert.equal(pts.direction,'favorable');assert.equal(reb.direction,'demanding');assert.equal(ast.direction,'neutral');
  assert.equal(pts.defense.games,48);
  assert.ok(pts.defense.appliedPct>0&&pts.defense.appliedPct<pts.defense.differencePct);
  assert.ok(pts.adjusted>pts.base.value);assert.ok(reb.adjusted<reb.base.value);
  assert.equal(ast.delta,0);
 });
 await check('El ajuste solo se presenta como estimación si supera la referencia en partidos posteriores',()=>{
  const p=get('pts');
  assert.ok(p.validation.games>=20);assert.ok(p.validation.adjustedError<p.validation.referenceError);
  assert.equal(p.kind,'estimate');assert.equal(get('ast').kind,'reference');
  const constant=history.map(r=>({...r,pts:20}));
  const wrong=get('pts',calc(constant));
  assert.equal(wrong.kind,'scenario');assert.equal(wrong.validation.referenceError,0);
  assert.ok(wrong.validation.adjustedError>0);
 });
 await check('Con poca muestra de validación, el resultado es escenario y no estimación',()=>{
  const early={...target,cutoff:date(16)};
  const {kind,validation,adjusted}=get('pts',calc(history,snapshot,early));
  assert.equal(kind,'scenario');assert.ok(validation.games<20);assert.ok(adjusted>20);
 });
 await check('No entran en el promedio el partido seleccionado, sus datos futuros ni parciales',()=>{
  const earlier={...snapshot,games:snapshot.games.filter(r=>r.date<target.cutoff)};
  const injected=[...history,row(48,{pts:100}),row(49,{pts:100}),row(47,{game_id:gameId(47,4000),period_scope:'Q1',pts:100}),
   row(47,{game_id:gameId(47,4100),split_code:'H1',pts:100}),row(47,{game_id:gameId(47,4200),player_id:996,pts:100})];
  assert.deepEqual(plain(calc(injected,snapshot)),plain(calc(history,earlier)));
 });
 await check('Fecha de corte estricta: incluso al evaluar partidos pasados solo cuenta la defensa anterior',()=>{
  const start={...target,cutoff:date(8)};
  const min=get('pts',calc(history,snapshot,start));
  assert.equal(min.defense.games,8);
  assert.equal(min.validation.games,0,'El octavo partido no agrega aún el resultado del día');
  assert.equal(get('pts',calc(history,snapshot,{...target,cutoff:date(7)})).adjusted,null);
 });
 await check('Ceros de boxscore cuentan; faltantes y conflictos no aparecen como cero',()=>{
  const early={...target,cutoff:date(12)};
  const missing=history.slice(0,12).map((r,i)=>({...r,pts:i===0||i>4?null:0}));
  const report=get('pts',calc(missing,snapshot,early));
  assert.equal(report.base,null);assert.equal(report.adjusted,null);assert.equal(report.direction,'unknown');
  const withZero=history.map((r,i)=>({...r,pts:i>=38?0:r.pts}));
  assert.equal(get('pts',calc(withZero)).base.value,0);
  const duplicate=row(38,{pts:100});
  assert.equal(get('pts',calc([...history,duplicate])).base.value,19.4);
 });
 await check('Sin cobertura por posición hay referencia global identificada; sin cobertura de liga no se proyecta',()=>{
  const withoutPos={...snapshot,games:snapshot.games.map(r=>r.team==='SAC'?{...r,groups:{ALL:r.groups.ALL}}:r)};
  assert.equal(get('pts',calc(history,withoutPos)).defense.group,'ALL');
  assert.equal(get('pts',calc(history,snapshot,{...target,position:'G-F'})).defense.group,'ALL');
  const low={...snapshot,games:snapshot.games.filter(r=>r.team==='SAC'||r.team==='BOS')};
  const p=get('pts',calc(history,low));
  assert.equal(p.base.value,20);assert.equal(p.defense,null);assert.equal(p.adjusted,null);
 });
 await check('Se ignoran defensas vencidas y no se mezclan playoffs ni equipos tras un traspaso',()=>{
  const old={...snapshot,games:snapshot.games.filter(r=>r.date<date(20))};
  assert.equal(get('pts',calc(history,old)).defense,null);
  assert.equal(get('pts',calc(history,snapshot,{...target,phase:'Playoffs'})).base,null);
  const switched=history.map((r,i)=>i===46?{...r,team_abbreviation:'ATL'}:r);
  assert.equal(get('pts',calc(switched)).base,null);
  assert.equal(model.matchupTeam(switched,playerId,date(47),'SAS','2026-10-26'),'ATL');
  assert.equal(model.matchupTeam(switched,playerId,date(47),'SAS',date(47)),'SAS');
 });

 const match={away:'SAS',home:'SAC',id:'22602015',start:'2026-12-05T03:00:00Z'};
 let schedule={available:true,games:[match]},authorized=true,throwArchive=false;
 let reads=0;
 const adapter=loader({
  './nbaArchive':{archiveEnabled:()=>true,archiveManifest:async()=>({parts:{['facts/'+playerId]:{},['defense/'+season]:{}}}),
   archivePart:async name=>{reads++;if(throwArchive)throw Error('PRIVATE_CONNECTION');return name.startsWith('facts')?history:snapshot;}},
  './currentRosters':{CURRENT_ROSTER_UPDATED_AT:'2026-10-26',getCurrentRosterPlayer:()=>({team_abbreviation:'SAS',position:'G'})},
  './ticketReader/calendar':{ticketSchedule:async()=>schedule},
  '@/lib/auth/server':{withAuth:fn=>req=>authorized?fn(req):{status:401}},
  'next/server':{NextResponse:{json:(body,config={})=>({body,status:config.status??200,headers:config.headers})}},
 });
 const api=adapter('app/api/nba-favorabilidad/route.ts'), url='http://localhost/api/nba-favorabilidad?playerId='+playerId+'&away=SAS&home=SAC';
 let output;
 await check('API privada: valida partido y toma la fecha NBA de un partido que arranca a medianoche en Argentina',async()=>{
  authorized=false;assert.equal((await api.GET({url:url+'&date=2026-12-05'})).status,401);authorized=true;
  assert.equal((await api.GET({url:url+'&date=2026-02-30'})).status,400);assert.equal(reads,0);
  schedule={available:true,games:[{...match,away:'BOS'}]};
  assert.equal((await api.GET({url:url+'&date=2026-12-05'})).body.reason,'calendar');assert.equal(reads,0);
  schedule={available:true,games:[match]};
  output=await api.GET({url:url+'&date=2026-12-05'});
  assert.equal(output.status,200);assert.equal(output.headers['Cache-Control'],'private, no-store');
  assert.equal(output.body.cutoff,'2026-12-04');assert.equal(output.body.team,'SAS');assert.equal(output.body.opponent,'SAC');
  await api.GET({url:url+'&date=2026-12-05'});assert.equal(reads,2);
  throwArchive=true;
  const error=await api.GET({url:url+'&date=2026-12-06'});
  assert.equal(error.status,503);assert.doesNotMatch(JSON.stringify(error),/PRIVATE/);
  throwArchive=false;
 });
 await check('La ficha declara los escenarios sin validar y oculta la proyección si el parte confirma la baja',()=>{
  const {MatchupFavorabilityReadout:Card}=load('components/NbaMatchupFavorabilityCard.tsx');
  const render=(props)=>DOM.renderToStaticMarkup(React.createElement(Card,props));
  const result={...output.body,data:calc(history,snapshot,{...target,cutoff:date(16)})};
  const html=render({result});
  for(const token of ['Puntos · Favorable','SAC concede','Produc','Rebotes','Asistencias','Escenario: mejora sin confirmar','Qué sostiene el ajuste']){
   assert.ok(html.includes(token),token);
  }
  const out=render({result,out:true});
  assert.match(out,/Figura fuera/);assert.doesNotMatch(out,/<table/);
  const partial=render({result:{...result,data:calc(history,{...snapshot,games:[]})}});
  assert.match(partial,/suficiente cobertura defensiva/);
 });
}
