import assert from 'node:assert/strict';
import {selectUpcomingOddsEvent, comparableQuotes, priceAt} from '../lib/nbaOdds.ts';

const now=new Date('2026-10-14T18:00:00Z');
const quote=(book,date,key,line,over,under,extra={})=>({
 player_name:'Stephon Castle',prop_type:'PTS',scope:'FULL',line,
 matchup:key,book,event_date:date,event_key:key,over_price:over,
 under_price:under,updated_at:'2026-10-14T15:39:08Z',...extra,
});
const rows=[
 quote('stake','2026-06-03','NYK-SAS|2026-06-03',16.5,1.76,1.92),
 quote('betano','2026-10-20','OKC-SAS|2026-10-20',15.5,1.82,1.85),
 quote('stake','2026-10-20','OKC-SAS|2026-10-20',15.5,1.85,1.82),
 quote('stake','2026-10-20','OKC-SAS|2026-10-20',16.5,1.99,1.60),
 quote('betano',null,'OKC-SAS|',16.5,1.78,null),
 quote('stake','2026-10-25','OKC-SAS|2026-10-25',15.5,9,9),
];
const selected=selectUpcomingOddsEvent(rows,null,now);
assert.equal(selected,'OKC-SAS|2026-10-20');
assert.equal(selectUpcomingOddsEvent(rows,'2026-06-03',now),selected);
assert.equal(selectUpcomingOddsEvent([...rows].reverse(),null,now),selected);
assert.equal(selectUpcomingOddsEvent(rows,'2026-10-25',now),'OKC-SAS|2026-10-25');
assert.equal(selectUpcomingOddsEvent([rows[0],rows[4]],null,now),'');
const current=comparableQuotes(rows,'pts','FULL',selected);
assert.equal(priceAt(current,'betano',15.5,'over')?.price,1.82);
assert.equal(priceAt(current,'betano',15.5,'under')?.price,1.85);
assert.equal(priceAt(current,'stake',15.5,'over')?.price,1.85);
assert.equal(priceAt(current,'stake',16.5,'over')?.price,1.99);
assert.equal(priceAt(current,'betano',16.5,'over'),null);
assert.equal(priceAt(current,'bet365',15.5,'over'),null);
assert.deepEqual(comparableQuotes(rows,'pts','Q1',selected),[]);
// A las 01:00 UTC todavía es el día anterior en Argentina.
const todayQuote=quote('stake','2026-10-14','OKC-SAS|2026-10-14',15.5,2,2);
assert.equal(selectUpcomingOddsEvent([todayQuote],null,new Date('2026-10-15T01:00:00Z')),todayQuote.event_key);
assert.equal(selectUpcomingOddsEvent([todayQuote],null,new Date('2026-10-15T04:00:00Z')),'');
console.log('OK: próximo partido, fechas pasadas/sin fecha, zona argentina, líneas, períodos y Over/Under.');
