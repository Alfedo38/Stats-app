import {decimalPrice,normalizedEvent,oddsBook,oddsMarket,oddsNumber,oddsScope} from './nbaOdds';
import {matchesOddsPlayer} from './oddsPlayerNames';
import {validDate} from './matchupFilters';
export type MovementQuery={date:string;game:string;player:string;book:string;market:string;scope:string;side:'over'|'under';line:number};
export type MovementPoint={at:string;price:number};
export function parseMovement(q:URLSearchParams):MovementQuery|null {
 const date=q.get('date')??'',game=q.get('game')??'',player=(q.get('player')??'').trim();
 const book=oddsBook(q.get('book')),market=oddsMarket(q.get('market')),scope=q.has('scope')?oddsScope(q.get('scope')):null,side=q.get('side');
 const line=oddsNumber(q.get('line'));
 if(!validDate(date)||!/^[A-Z]{3}-[A-Z]{3}$/.test(game)||game!==normalizedEvent(game)||!player||player.length>120||!book||!market||!scope||(side!=='over'&&side!=='under')||line===null||line<0||line>300)return null;
 return {date,game,player,book,market,scope,side,line};
}
export function movementPoints(rows:Record<string,unknown>[],query:MovementQuery,now=Date.now()){
 const byTime=new Map<string,number>(),conflicts=new Set<string>();
 for(const row of rows){
  if(oddsBook(row.book)!==query.book||normalizedEvent(row.game_norm)!==query.game||!matchesOddsPlayer(row.player_name,row.player_norm,query.player)||oddsMarket(row.stat_key)!==query.market||oddsScope(row.period_scope)!==query.scope||row.side!==query.side||oddsNumber(row.line)!==query.line)continue;
  const price=decimalPrice(row.price),time=row.at instanceof Date?row.at.getTime():Date.parse(String(row.at??''));
  if(price===null||!Number.isFinite(time)||time>now)continue;
  const at=new Date(time).toISOString(),previous=byTime.get(at);
  if(previous!==undefined&&previous!==price)conflicts.add(at);
  byTime.set(at,price);
 }
 const points:MovementPoint[]=[...byTime].filter(([at])=>!conflicts.has(at)).map(([at,price])=>({at,price})).sort((a,b)=>a.at.localeCompare(b.at));
 return {points:points.slice(-80),limited:points.length>80,conflicts:conflicts.size};
}
