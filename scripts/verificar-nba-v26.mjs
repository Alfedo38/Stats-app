import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),ts=require('typescript'),modules=new Map();
function load(name){
 const file=path.resolve(name.endsWith('.ts')?name:name+'.ts');
 if(modules.has(file))return modules.get(file).exports;
 const module={exports:{}};modules.set(file,module);
 const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(compiled,{module,exports:module.exports,Date,URL,URLSearchParams,crypto:globalThis.crypto,
  require:n=>n.startsWith('.')?load(path.join(path.dirname(file),n)):n.startsWith('@/')?load(n.slice(2)):require(n)},{filename:file});
 return module.exports;
}
const plain=value=>JSON.parse(JSON.stringify(value));
function check(name,test){test();console.log('OK '+name);}

check('Ficha, Jornada y analizador identifican la misma cuota a medianoche UTC',()=>{
 const odds=load('lib/nbaOdds'),jornada=load('lib/nbaJornada'),model=load('lib/ticketReader/model'),quotes=load('lib/ticketReader/quoteMatch');
 const date='2026-11-21',now=new Date('2026-11-21T19:00:00Z');
 const row={book:'betano',jugador:'Stephon Castle',league:'NBA',stat_key:'AST',side:'at_least',model_line:8,odds_decimal:2.12,
  game_norm:'nop-sas',start_time:'2026-11-22T01:30:00Z',game_date:'2026-11-22',period_scope:'FULL',valid:true,scraped_at_utc:'2026-11-21T18:00:00Z'};
 const game={id:'0022600282',away:'NOP',home:'SAS',start:row.start_time,status:1};
 const leg={...model.emptyLeg(date,'betano'),playerName:row.jugador,market:'AST',operator:'over',line:7.5,teams:['NOP','SAS'],scope:'FULL'};
 const lookup=(raw)=>[odds.priceAt(odds.groupUniversalQuotes(raw,now),'betano',7.5,'over')?.price??null,
  jornada.jornadaQuotes(raw,row.jugador,game,date,'ast',now)[0]?.over_price??null,quotes.selectQuote(raw,leg,now).price??null];
 assert.deepEqual(lookup([row]),[2.12,2.12,2.12]);
 assert.equal(odds.groupUniversalQuotes([row],now)[0].event_date,date);
 assert.equal(quotes.selectQuote([row],{...leg,line:8},now).diagnostic.reason,'LINE_MISMATCH');
 assert.deepEqual(lookup([{...row,scope:'Q1'}]),[null,null,null]);
 assert.deepEqual(lookup([row,{...row,active:true,is_active:'false',scraped_at_utc:'2026-11-21T18:10:00Z'}]),[null,null,null]);
 assert.deepEqual(lookup([{...row,scraped_at_utc:'2026-11-21T19:01:00Z'}]),[null,null,null]);
 assert.equal(quotes.selectQuote([{...row,event_date:'2026-11-22'}],leg,now).diagnostic.reason,'DATE_MISMATCH');
});

check('La edición oficial reemplaza En duda por Disponible y conserva el parte pendiente',()=>{
 const {mergeInjuryEditions,prepareInjuryItems}=load('lib/injuryReport');
 const {confirmedGameAbsences}=load('lib/jornadaAbsenceImpact');
 const date='2026-11-21',game={id:'0022600282',date,away:'NOP',home:'PHI',start:'2026-11-21T21:00:00Z'};
 const now=new Date('2026-11-21T19:57:00Z');
 const legacy=[{id:1,game_date:date,matchup:'NOP@PHI',team:'PHI',player_name:'Tyrese Maxey',normalized_status:'QUESTIONABLE',report_ts:'2026-11-21T18:00:00Z'},
  {id:2,game_date:date,matchup:'NOP@PHI',team:'NOP',player_name:'Jugador local',normalized_status:'OUT',report_ts:'2026-11-21T18:00:00Z'}];
 const latest=[{game_date:date,matchup:'NOP@PHI',team:'Philadelphia 76ers',state:'listed',players:[{name:'Maxey, Tyrese',status:'AVAILABLE'}],report_ts:'2026-11-21T19:45:00Z'},
  {game_date:date,matchup:'NOP@PHI',team:'New Orleans Pelicans',state:'pending',players:[],report_ts:'2026-11-21T19:45:00Z'}];
 const combined=mergeInjuryEditions(legacy,latest,[game],now),roster=[{player_id:10,full_name:'Tyrese Maxey',team_abbreviation:'PHI'}];
 const {items}=prepareInjuryItems(combined.rows,[game],roster,date,'2026-11-22',now);
 assert.equal(items.length,1);assert.equal(items[0].status,'AVAILABLE');assert.equal(items[0].playerId,10);
 assert.equal(confirmedGameAbsences({available:true,calendarAvailable:true,stale:false,items,editions:combined.editions},game,date,'NOP'),null);
 assert.equal(mergeInjuryEditions(legacy,latest,[game],new Date('2026-11-21T20:31:00Z')).editions.every(x=>x.stale),true);
 const old=mergeInjuryEditions(legacy,latest.map(x=>({...x,report_ts:'2026-11-21T17:45:00Z'})),[game],now);
 assert.equal(old.editions.length,0);assert.equal(old.rows[0].normalized_status,'QUESTIONABLE');
});

check('La línea invalida solo resultados y el rival puede retroceder cuatro temporadas',()=>{
 const {playerHistoryRowsRequest,rescorePlayerHistory}=load('lib/playerHistorySelection');
 const {playerWindowRows}=load('lib/nbaHistoryWindow');
 const rows=[{game_id:123,value:8,game_date:'2026-11-19'},{game_id:124,value:7,game_date:'2025-11-19'},{game_id:125,value:null,game_date:'2023-11-19'},
  {game_id:126,value:6,game_date:'2022-11-19'},{game_id:127,value:5,game_date:'2026-11-21'}];
 assert.deepEqual(plain(playerHistoryRowsRequest({market:'AST',line:7.5,side:'under'})),plain(playerHistoryRowsRequest({market:'AST',line:8.5,side:'over'})));
 assert.deepEqual(plain(playerWindowRows(rows,'2026-11-21','current',false).map(x=>x.game_id)),[123]);
 assert.deepEqual(plain(playerWindowRows(rows,'2026-11-21','previous',false).map(x=>x.game_id)),[124]);
 assert.deepEqual(plain(playerWindowRows(rows,'2026-11-21','current',true).map(x=>x.game_id)),[123,124,125]);
 const input={games:rows.slice(0,3),summary:{},recent:{l5:{}}};
 const over=rescorePlayerHistory(input,7.5,'over'),under=rescorePlayerHistory(input,8,'under');
 assert.deepEqual(plain(over.games.map(x=>x.outcome)),['hit','miss','missing']);
 assert.deepEqual(plain(under.games.map(x=>x.outcome)),['push','hit','missing']);
 assert.equal(under.summary.hitRatePct,100);assert.equal(under.recent.l5.pushes,1);
 assert.equal('hit' in input.games[0],false);
});

check('Los quintetos y reemplazos salen de tramos conciliados y no parean cambios múltiples',()=>{
 const {countRotationChanges,quarterRole}=load('lib/nbaSubstitutions'),{verifiedStarters}=load('lib/nbaRotations');
 const id='0022600282',date='2026-11-21',team='SAS';
 const row=(a,b)=>({gameId:id,date,team,played:true,starter:a===0,boxMs:b-a,playedMs:b-a,periods:4,spans:[[1,a,b]]});
 const single=new Map([[1,row(0,240000)],[2,row(240000,720000)],...[3,4,5,6].map(pid=>[pid,row(0,720000)])]);
 const changes=countRotationChanges([{gameId:id,team,players:single}],1);
 assert.deepEqual(plain(changes.inForPlayer),[{id:2,count:1}]);assert.equal(changes.multiple,0);
 const many=new Map(single);many.set(3,row(0,240000));many.set(7,row(240000,720000));
 const mixed=countRotationChanges([{gameId:id,team,players:many}],1);assert.equal(mixed.multiple,1);assert.equal(mixed.inForPlayer.length,0);
 assert.deepEqual(plain(verifiedStarters(Object.fromEntries(single),id,team,date)),[1,3,4,5,6]);
 assert.equal(verifiedStarters(Object.fromEntries(single),id,'NOP',date).length,0);
 assert.deepEqual(plain(quarterRole([single.get(1)])[0]),{quarter:1,minutes:4,played:1,games:1});
});

check('Rebotes por tipo usan la misma muestra y omiten incompletos e inconsistencias',()=>{
 const {reboundSplit}=load('lib/marketEvidence');
 const data=[{game_id:1,oreb:0,dreb:5,reb:5},{game_id:2,oreb:2,dreb:7,reb:9},
  {game_id:3,oreb:null,dreb:4,reb:4},{game_id:4,oreb:4,dreb:4,reb:5}];
 assert.deepEqual(plain(reboundSplit(data)),{count:2,total:4,offense:1,defense:6});
});

check('El perfil ofensivo del día requiere captura anterior al salto inicial confirmado',()=>{
 const {playerPlaytypes}=load('lib/nbaPlaytypes');
 const season='2026-27',date='2026-11-21',snap={version:1,season,capturedOn:date,capturedAt:'2026-11-21T12:30:00-05:00',
  players:{1642264:{PRBallHandler:[2.4,1.12,13,61]}},teams:{NOP:{PRBallHandler:[8.2,1.22,12,80]}}};
 assert.equal(playerPlaytypes(snap,1642264,'NOP',season,date).available,false);
 const verified=playerPlaytypes(snap,1642264,'NOP',season,date,'2026-11-22T01:30:00Z');
 assert.equal(verified.rows[0].games,13);assert.equal(verified.rows[0].rivalPpp,1.22);
 assert.equal(playerPlaytypes(snap,1642264,'NOP',season,date,'2026-11-21T17:30:00Z').available,false);
});
