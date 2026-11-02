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
const load=loader(),e=load('./lib/marketEvidence.ts'),m=e.EVIDENCE_METRICS;
const row=(id,date,values)=>({game_id:String(id),game_date:date,season_type:"Regular Season",...values});
const summary=(rows,id,scope='FULL')=>e.summarizeEvidence(rows,m[id],scope);
await check('Puntos usa MIN, FGA, FTA y PTS',()=>assert.equal(e.evidenceMetricIds('pts').join(','),'minutes,fga,fta,pts'));
await check('Triples usa 3PA, 3PM y acierto, también con alias',()=>{for(const key of['fg3m','fg3a','3PTM','3PA'])assert.equal(e.evidenceMetricIds(key).join(','),'minutes,fg3a,fg3m,fg3_rate');});
await check('Asistencias y rebotes priorizan oportunidades y conversión',()=>{assert.equal(e.evidenceMetricIds('ast').join(','),'minutes,potential_ast,ast,ast_conversion');assert.equal(e.evidenceMetricIds('reb').join(','),'minutes,rebound_chances,reb,reb_conversion');});
await check('Combos se identifican completos, sin caer en el primer componente',()=>{assert.equal(e.evidenceMetricIds('PRA').join(','),'minutes,pts,reb,ast');assert.equal(e.evidenceMetricIds('ra').join(','),'minutes,reb,ast,ra');assert.equal(e.evidenceValue({reb:4,ast:3},'ra'),7);assert.equal(e.evidenceValue({reb:4,ast:null},'ra'),null);});
await check('Todos los mercados visibles ofrecen cuatro tarjetas válidas',()=>{for(const key of['pts','ast','reb','pts+ast','pts+reb','reb+ast','pts+reb+ast','fgm','fga','fg3m','fg3a','fta','ftm','blk','stl','stl+blk','tov','pf','usage_pct','touches']){const ids=e.evidenceMetricIds(key);assert.equal(ids.length,4);assert.equal(new Set(ids).size,4);assert.ok(ids.every(id=>m[id]));}});
await check('Cobertura usa partidos con valor, sin convertir faltantes en cero',()=>{const s=summary([{potential_ast:8,ast:2},{potential_ast:null,ast:4},{potential_ast:0,ast:0}], 'potential_ast');assert.equal(s.average,4);assert.equal(s.count,2);assert.equal(s.total,3);});
await check('Último no reutiliza el valor de un partido anterior',()=>{const s=summary([row(1,'2026-10-26',{potential_ast:8}),row(2,'2026-10-27',{potential_ast:null})],'potential_ast');assert.equal(s.average,8);assert.equal(s.latest,null);assert.equal(s.count,1);assert.equal(s.total,2);});
await check('Último ordena fechas y conserva un cero real',()=>{const s=summary([row(2,'2026-10-27',{fg3a:0}),row(1,'2026-10-26',{fg3a:8})],'fg3a');assert.equal(s.latest,0);assert.equal(s.average,4);});
await check('Conversión AST usa solo pares con ambos datos',()=>{const s=summary([{ast:2,potential_ast:4},{ast:5,potential_ast:null},{ast:1,potential_ast:6}], 'ast_conversion');assert.equal(s.count,2);assert.equal(s.total,3);assert.equal(s.numerator,3);assert.equal(s.denominator,10);assert.equal(s.average,30);});
await check('Acierto de triple pondera intentos, no promedia porcentajes',()=>{const s=summary([{fg3m:1,fg3a:1},{fg3m:1,fg3a:9}],'fg3_rate');assert.equal(s.average,20);assert.equal(s.count,2);});
await check('Captura de rebotes pondera chances de los mismos partidos',()=>{const s=summary([{reb:5,rebound_chances:10},{reb:3,rebound_chances:6},{reb:null,rebound_chances:9}],'reb_conversion');assert.equal(s.average,50);assert.equal(s.count,2);assert.equal(s.denominator,16);});
await check('Oportunidades cero no causan división por cero ni un falso 0%',()=>{const s=summary([{ast:0,potential_ast:0}],'ast_conversion');assert.equal(s.average,null);assert.equal(s.count,0);assert.equal(s.zeroOpportunities,1);assert.match(e.evidenceMissingText(s),/Sin oportunidades/);});
await check('Potenciales inferiores a asistencias quedan excluidas y explicadas',()=>{const s=summary([{ast:8,potential_ast:3},{ast:3,potential_ast:6}],'potential_ast');assert.equal(s.average,6);assert.equal(s.count,1);assert.equal(s.invalid,1);assert.match(e.evidenceMissingText(s),/inconsistente/);});
await check('Conversión no supera 100% con registros incoherentes',()=>{const s=summary([{reb:8,rebound_chances:3}],'reb_conversion');assert.equal(s.average,null);assert.equal(s.invalid,1);});
await check('Cero confirmado es un valor válido en triple y libres',()=>{for(const id of['fg3m','fg3a','fta','ftm']){const s=summary([{[id]:0}],id);assert.equal(s.average,0);assert.equal(s.count,1);}});
await check('Q1 conserva valores del cuarto sin copiar tracking completo',()=>{const s=summary([{split_code:'Q1',pts:6,ast:2,potential_ast:null}], 'potential_ast','Q1');assert.equal(s.average,null);assert.match(e.evidenceMissingText(s,'Q1'),/Sin tracking de este período/);assert.equal(e.evidenceValue({pts:35},'pts','Q1'),null);});
await check('MIN del cuarto requiere comprobación, tal como en el primer paquete',()=>{const s=summary([{split_code:'Q1',min:35.5}],'minutes','Q1');assert.equal(s.average,null);assert.match(e.evidenceMissingText(s,'Q1'),/Sin minutos comprobados/);});
await check('Sin partidos, sin tracking y sin métrica tienen mensajes diferentes',()=>{assert.match(e.evidenceMissingText(summary([],'ast')),/Sin partidos/);assert.match(e.evidenceMissingText(summary([{}],'potential_ast')),/Sin tracking/);assert.match(e.evidenceMissingText(summary([{}],'fg3a')),/Sin datos de esta métrica/);});
await check('IDs con ceros iniciales no duplican la cobertura',()=>{const s=summary([row('001','2026-10-27',{ast:4}),row('1','2026-10-27',{ast:4})],'ast');assert.equal(s.total,1);assert.equal(s.average,4);});
await check('Cobertura de contexto distingue partidos, tiros y defensores',()=>{const c=e.contextEvidence([{id:'001'},{id:'2'}],[{game_id:'1'},{game_id:'1'},{game_id:'9'}],[{game_id:'002'}]);assert.equal(c.total,2);assert.equal(c.shots,1);assert.equal(c.matchups,1);assert.match(e.contextEmptyText('matchups',{total:1,shots:1,matchups:0}),/1 partido.*0 con asignaciones/);});
const grid=load('./components/SupportingDataGrid.tsx').default;
await check('Tarjetas conservan cuatro artículos y muestran conteos visibles',()=>{const t=grid({stats:[{min:30,fg3a:8,fg3m:3}],activeStat:'fg3m',activeStatLabel:'3PTM',sampleLabel:'L30 · 1 PJ'});assert.equal(nodes(t).filter(n=>n.type==='article').length,4);const html=text(t);assert.match(html,/Triples intentados/);assert.match(html,/37.5%/);assert.match(html,/1\/1 PJ/);assert.match(html,/L30/);});
await check('Tarjetas de asistencias no priorizan pases sin cobertura',()=>{const html=text(grid({stats:[{ast:3,potential_ast:6}],activeStat:'ast',activeStatLabel:'AST'}));assert.ok(!html.includes('Pases'));assert.match(html,/Conversión de asist/);assert.match(html,/50.0%/);});
await check('Carga o error no dejan valores ni motivos de ausencia falsos',()=>{for(const state of[{loading:true},{error:'error'}]){const html=text(grid({stats:[{ast:99,potential_ast:100}],activeStat:'ast',activeStatLabel:'AST',...state}));assert.ok(!html.includes('99.0%'));assert.ok(!html.includes('Sin tracking'));assert.ok(!html.includes('Sin partidos'));}});
await check('Porcentajes y minutos parciales no generan filtros incompatibles',()=>{const t=grid({stats:[{split_code:'Q1',period_minutes_verified:true,min:8,fg3a:4,fg3m:2}],scope:'Q1',activeStat:'fg3m',activeStatLabel:'3PTM',onFilterChange(){}});const articles=nodes(t).filter(n=>n.type==='article');assert.equal(nodes(articles[0]).filter(n=>n.type==='button').length,0);assert.equal(nodes(articles[3]).filter(n=>n.type==='button').length,0);});
const header=load('./components/PlayerHeader.tsx').default;
await check('Cabecera identifica L5, partido completo y cobertura',()=>{const html=text(header({playerName:'Jugador QA',teamAbbr:'LAL',kpis:[{label:'Toques',value:'S/D',sample:{label:'L5 · Partido completo',count:0,total:5}}]}));assert.match(html,/L5 · Partido completo/);assert.match(html,/Toques · 0\/5 PJ/);});
const api=loader({'./nbaArchive':{archiveEnabled:()=>true,archivedPlayer:async()=>[row(1,'2026-10-27',{pts:20,min:30,ftm:4,fta:5,oreb:2,dreb:4})]},'@/lib/prisma':{}})('./lib/playerHistory.ts');
await check('La lectura existente entrega libres y rebotes sin nuevas consultas',async()=>{const r=await api.getPlayerHistoricalExplorer({playerId:1,market:'PTS',line:20.5,phase:'ALL',mode:'all'});assert.equal(r.games[0].ftm,4);assert.equal(r.games[0].oreb,2);assert.equal(r.games[0].dreb,4);});
await check('Las tarjetas respetan una muestra recibida mayor a treinta partidos',()=>{const stats=Array.from({length:45},(_,i)=>({game_id:String(i+1),ast:2,potential_ast:4}));const html=text(grid({stats,activeStat:'ast',activeStatLabel:'AST'}));assert.match(html,/45\/45 PJ/);assert.match(html,/50.0%/);});
const report={package:'nba-contexto-mercados-v1',ok:true,checks:checks.length,tests:checks,fixtures:true,network:false,database:false};
const output=path.join(root,'maintenance-state/qa/contexto-mercados-v1.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});
console.log(`\nContexto por mercado: ${checks.length} verificaciones correctas. Informe privado: ${path.relative(root,output)}. Sin red ni base de datos.`);
