import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),root=process.cwd(),cache=new Map();
function load(name){
 if(!name.startsWith('.')&&!name.startsWith('@/')&&!path.isAbsolute(name))return require(name);
 let file=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(root,name);
 if(!fs.existsSync(file))file=['.ts','.tsx','.mjs','.js'].map(ext=>file+ext).find(fs.existsSync);
 if(!file)throw Error('No existe módulo '+name);
 if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 vm.runInNewContext(output,{module,exports:module.exports,require:n=>n.startsWith('.')?load(path.resolve(path.dirname(file),n)):load(n),console,Intl,Date,Number,Map,Set,URLSearchParams},{filename:path.relative(root,file)});
 return module.exports;
}
const m=load('./lib/nbaStudio.ts'),stats=load('./lib/selectionStats.ts'),checks=[];
function check(name,fn){fn();checks.push(name);console.log('OK '+name);}
const plain=v=>JSON.parse(JSON.stringify(v));
const fact=(id,day,extra={})=>({game_id:id,game_date:day,season_type:'Regular Season',minutes:30,pts:15,reb:5,ast:4,opponent:'CHA',...extra});
const at='2026-11-17',now=new Date('2026-11-17T16:00:00Z');
check('Ventana de temporada actual y anterior; excluye el propio día y el futuro',()=>{
 const rows=[fact(1,'2026-11-16'),fact(2,'2026-05-01'),fact(3,'2025-03-01'),fact(4,at),fact(5,'2026-11-18')];
 assert.deepEqual(plain(m.studioBaseRows(rows,at).map(m.studioId)),['1','2']);
});
check('Pretemporada y DNP no entran como partidos de valor cero',()=>{
 assert.equal(m.studioBaseRows([fact(1,'2026-11-10',{season_type:'Pre Season'}),fact(2,'2026-11-11',{minutes:0})],at).length,0);
});
check('IDs con ceros iniciales no duplican el partido',()=>assert.equal(m.studioBaseRows([fact('002260001','2026-11-16'),fact('2260001','2026-11-16')],at).length,1));
check('Dobles intentados y anotados usan columnas diferentes',()=>{
 const r={fga:22,fgm:9,fg3a:8,fg3m:3};assert.equal(m.studioValue(r,'fg2a'),14);assert.equal(m.studioValue(r,'fg2m'),6);assert.equal(m.studioValue(r,'fg3a'),8);assert.equal(m.studioValue(r,'fg3m'),3);
});
check('Dobles de Q1, H1 y H2 usan solo sus columnas; cero confirmado no equivale a un faltante',()=>{
 const periods=load('./lib/nbaPeriodStats');
 const full={game_id:'0022600001',fga:14,fgm:9,fg3a:5,fg3m:3,q1_fga:4,q1_fgm:2,q1_fg3a:4,q1_fg3m:2,h1_fga:8,h1_fgm:5,h1_fg3a:3,h1_fg3m:2};
 assert.equal(periods.periodMetricValue(full,'fg2a','FULL'),9);
 assert.equal(periods.periodMetricValue(full,'fg2m','Q1'),0);
 assert.equal(periods.periodMetricValue(full,'fg2a','H1'),5);
 assert.equal(periods.periodMetricValue(full,'fg2a','H2_REG'),null);
 const [q1]=periods.buildPeriodRows([full],[],'Q1','fg2a');assert.equal(periods.periodMetricValue(q1,'fg2a','Q1'),0);
 assert.equal(periods.buildPeriodRows([{...full,q1_fg3a:null}],[],'Q1','fg2a').length,0);
 assert.equal(periods.periodMetricValue({fga:10,fgm:9,fg3a:8,fg3m:3},'fg2a','FULL'),null);
});
check('Dobles incompletos, negativos o contradictorios quedan sin dato',()=>{
 assert.equal(m.studioValue({fga:8,fg3a:null},'fg2a'),null);assert.equal(m.studioValue({fga:5,fg3a:8},'fg2a'),null);assert.equal(m.studioValue({fgm:2,fg3m:3},'fg2m'),null);
});
check('Cero confirmado se conserva; booleanos, vacíos y objetos no lo producen',()=>{
 assert.equal(m.studioValue({pts:0},'pts'),0);for(const value of [null,'',false,{},undefined])assert.equal(m.studioValue({pts:value},'pts'),null);
});
check('Combos exigen todas sus estadísticas',()=>{assert.equal(m.studioValue({pts:12,reb:3,ast:null},'pra'),null);assert.equal(m.studioValue({pts:12,reb:3,ast:0},'pra'),15);});
check('Línea arranca en el promedio L10 sobre la grilla 0.5,1.5,…',()=>{
 assert.equal(m.studioLine([10,11,12,13,14,15,16,17,18,19,1000]),14.5);assert.equal(m.studioLine([0,0]),.5);assert.equal(m.studioLine([null,null]),null);assert.ok(m.validStudioLine(11.5));assert.ok(!m.validStudioLine(11));assert.ok(!m.validStudioLine(11.25));
});
check('Menos de invierte el acierto del mismo resultado',()=>{
 assert.equal(stats.selectionSummary([5,8,11],7.5,'over').hits,2);assert.equal(stats.selectionSummary([5,8,11],7.5,'under').hits,1);
});
check('Sin muestra no hay promedio cero ni probabilidad ni veredicto',()=>{
 const s=stats.selectionSummary([null,null],4.5,'under');assert.equal(s.average,null);assert.equal(s.rate,null);assert.match(m.studioExplain([null,null],4.5,'under'),/Sin muestra/);
});
check('L5 no reemplaza un dato ausente por un partido más antiguo',()=>{
 const rows=Array.from({length:8},(_,i)=>fact(i+1,'2026-11-'+String(16-i).padStart(2,'0'),{potential_ast:i===2?null:8}));
 const sample=m.studioSample(rows,[],{date:at,market:'potential_ast',scope:'FULL',range:'5',opponent:'CHA'});
 assert.equal(sample.length,5);assert.equal(stats.selectionSummary(sample.map(r=>m.studioValue(r,'potential_ast')),7.5,'over').valid,4);
});
check('Q1 faltante no usa valores ni minutos de partido completo',()=>{
 const rows=[fact('002260001','2026-11-16')],sample=m.studioSample(rows,[],{date:at,market:'pts',scope:'Q1',range:'10',opponent:'CHA'});
 assert.equal(sample.length,1);assert.equal(m.studioValue(sample[0],'pts','Q1'),null);assert.equal(m.studioValue(sample[0],'minutes','Q1'),null);
});
check('Q1 real une identidad y respeta un cero estadístico',()=>{
 const rows=[fact('002260001','2026-11-16')],splits=[{game_id:'2260001',split_code:'Q1',pts:0,min_text:'30:00'}],sample=m.studioSample(rows,splits,{date:at,market:'pts',scope:'Q1',range:'10',opponent:'CHA'});
 assert.equal(m.studioValue(sample[0],'pts','Q1'),0);assert.equal(m.studioValue(sample[0],'minutes','Q1'),null);
});
check('H2H usa partidos propios contra el rival y mantiene ambas temporadas',()=>{
 const rows=[fact(1,'2026-11-16'),fact(2,'2026-11-14',{opponent:'BOS'}),fact(3,'2026-04-01')];
 assert.deepEqual(plain(m.studioSample(rows,[],{date:at,market:'pts',scope:'FULL',range:'rival',opponent:'CHA'}).map(m.studioId)),['1','3']);
});
check('Temporada actual y anterior se pueden consultar por separado',()=>{
 const rows=[fact(1,'2026-11-16'),fact(2,'2026-04-01')],opts={date:at,market:'pts',scope:'FULL',opponent:'CHA'};
 assert.equal(m.studioSample(rows,[],{...opts,range:'season'}).length,1);assert.equal(m.studioSample(rows,[],{...opts,range:'previous'})[0].game_id,2);
});
check('Filtros de fase, localía y minutos se aplican antes de tomar L5',()=>{
 const rows=[fact(1,'2026-11-16',{minutes:10,home_away:'HOME'}),fact(2,'2026-11-14',{minutes:31,home_away:'HOME'}),fact(3,'2026-11-12',{minutes:33,home_away:'AWAY'})];
 assert.deepEqual(plain(m.studioSample(rows,[],{date:at,market:'pts',scope:'FULL',range:'5',opponent:'CHA',venue:'HOME',minMinutes:20}).map(m.studioId)),['2']);
});
const quote={player_name:'Luka Dončić',prop_type:'PTS',line:25.5,matchup:'LAL @ CHA',scope:'FULL',event_date:at,book:'betano',over_price:1.9,under_price:1.8,updated_at:'2026-11-17T12:00:00Z'};
const target={name:'Luka Doncic',market:'pts',scope:'FULL',teams:['LAL','CHA'],date:at,line:25.5,side:'over',book:'betano'};
check('Cuota exacta requiere jugador, casa, fecha, evento, mercado, período y línea',()=>{
 assert.equal(m.studioQuote([quote],target,now).price,1.9);
 for(const extra of [{player_name:'Otro Jugador'},{book:'stake'},{event_date:'2026-11-16'},{matchup:'LAL @ BOS'},{prop_type:'AST'},{scope:'Q1'},{line:26.5}])assert.equal(m.studioQuote([{...quote,...extra}],target,now),null);
});
check('Cuotas futuras, sin fecha o sin captura no se adivinan',()=>{
 for(const extra of [{updated_at:'2026-11-18T12:00:00Z'},{updated_at:null},{event_date:null}])assert.equal(m.studioQuote([{...quote,...extra}],target,now),null);
});
check('Última cuota retirada no revive una captura anterior',()=>{
 assert.equal(m.studioQuote([quote,{...quote,over_price:null,updated_at:'2026-11-17T13:00:00Z'}],target,now),null);
});
check('Precios contradictorios de la misma captura quedan sin precio',()=>assert.equal(m.studioQuote([quote,{...quote,over_price:2}],target,now),null));
check('Resultado individual entero no lleva decimales añadidos',()=>{assert.equal(m.studioNumber(11),'11');assert.equal(m.studioNumber(11.5),'11,5');});
check('Una racha se corta por dato faltante o primer fallo',()=>{assert.equal(m.studioStreak([9,8,null,9],7.5,'over'),2);assert.equal(m.studioStreak([9,7,9],7.5,'over'),1);});
console.log(`\nInterfaz NBA v2: ${checks.length} verificaciones correctas. Sin red ni base de datos.`);
