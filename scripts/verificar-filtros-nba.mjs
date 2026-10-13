import assert from 'node:assert/strict';
import {parsePhase,gamePhase,phaseRows,absenceRows,cleanAbsences,phaseSql} from '../lib/nbaGameFilters.ts';
assert.equal(parsePhase('regular'),'Regular Season');assert.equal(parsePhase('PLAYOFFS'),'Playoffs');assert.equal(parsePhase(null),'ALL');
assert.equal(gamePhase({game_id:'0022500001'}),'Regular Season');assert.equal(gamePhase({game_id:'22500001'}),'Regular Season');assert.equal(gamePhase({game_id:'0042500001'}),'Playoffs');assert.equal(gamePhase({game_id:'42500001'}),'Playoffs');
assert.equal(gamePhase({game_id:'0012500001'}),null);assert.equal(gamePhase({game_id:'0052500001'}),null);assert.equal(gamePhase({game_id:'bad'}),null);assert.equal(gamePhase({game_id:'0022500001',season_type:'Preseason'}),'preseason');
const rows=[{game_id:'0022500001',fg3m:0},{game_id:'0042500001',fg3m:2},{game_id:'0022500002',fg3m:3},{game_id:'0042500002',fg3m:1}];
const matches={Alice:['22500001','42500001','22500002'],Bob:['0042500001','0022500002'],Cara:[]};
assert.deepEqual(absenceRows(rows,['Alice','Bob'],matches).map(row=>row.game_id),['0042500001','0022500002']);
assert.deepEqual(absenceRows(phaseRows(rows,'Playoffs'),['Alice','Bob'],matches).map(row=>row.game_id),['0042500001']);
assert.deepEqual(absenceRows(phaseRows(rows,'Regular Season'),['Alice','Bob'],matches).map(row=>row.game_id),['0022500002']);
assert.equal(absenceRows(rows,['Alice'],matches)[0].fg3m,0);
assert.equal(absenceRows(rows,['Cara'],matches).length,0);assert.equal(absenceRows(rows,['Unknown'],matches).length,0);assert.equal(absenceRows(rows,['Alice'],null).length,0);assert.equal(absenceRows([{game_date:'2026-01-01'}],['Alice'],matches).length,0);
assert.equal(absenceRows(rows,[],null),rows);assert.equal(phaseRows(rows,'ALL'),rows);
assert.deepEqual(cleanAbsences([' Alice ','alice','Bob',null,'']),['Alice','Bob']);assert.equal(cleanAbsences(Array.from({length:10},(_,i)=>'P'+i)).length,8);
const params=new URLSearchParams();params.set('phase','Playoffs');['Alice','Bob'].forEach(n=>params.append('absent',n));assert.equal(parsePhase(params.get('phase')),'Playoffs');assert.deepEqual(cleanAbsences(params.getAll('absent')),['Alice','Bob']);
// The matching window is applied after the phase and the simultaneous absence intersection.
assert.deepEqual(absenceRows(rows,['Alice','Bob'],matches).slice(-1).map(row=>row.game_id),['0022500002']);
assert.throws(()=>phaseSql('h;delete'));assert.ok(phaseSql('h').includes('to_jsonb(h)'));assert.ok(phaseSql('h').includes('Playoffs'));
console.log('Filtros NBA: fases, IDs sin ceros, pretemporada, ausencias simultáneas, faltantes, ceros, ventana y enlace compartido OK.');
