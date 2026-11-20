import {finiteStat} from './selectionStats';

export const NBA_TEAM_IDS:Record<string,number>={ATL:1610612737,BOS:1610612738,CLE:1610612739,NOP:1610612740,CHI:1610612741,DAL:1610612742,DEN:1610612743,GSW:1610612744,HOU:1610612745,LAC:1610612746,LAL:1610612747,MIA:1610612748,MIL:1610612749,MIN:1610612750,BKN:1610612751,NYK:1610612752,ORL:1610612753,IND:1610612754,PHI:1610612755,PHX:1610612756,POR:1610612757,SAC:1610612758,SAS:1610612759,OKC:1610612760,TOR:1610612761,UTA:1610612762,MEM:1610612763,WAS:1610612764,DET:1610612765,CHA:1610612766};
export function nbaPortrait(id:unknown){const raw=String(id??'');return /^[1-9]\d{0,9}$/.test(raw)?`https://cdn.nba.com/headshots/nba/latest/260x190/${raw}.png`:null;}
export function nbaLogo(team:string){const id=NBA_TEAM_IDS[team.toUpperCase()];return id?`https://cdn.nba.com/logos/nba/${id}/global/L/logo.svg`:null;}
export function opportunityFor(market:string,scope='FULL'){
 return scope!=='FULL'?null:market==='ast'?'potential_ast':market==='reb'?'rebound_chances':null;
}
export function isOpportunityPair(market:string,other:string|undefined|null){return !!other&&opportunityFor(market)===other;}
/** Same games, observed values only; a missing denominator never becomes zero. */
export function pairedOpportunity<T>(rows:T[],main:(row:T)=>unknown,opportunity:(row:T)=>unknown){
 let made=0,chances=0,count=0,inconsistent=0,zero=0;
 for(const row of rows){const a=finiteStat(main(row)),b=finiteStat(opportunity(row));if(a===null||b===null)continue;if(a>b){inconsistent++;continue;}if(b===0){zero++;continue;}made+=a;chances+=b;count++;}
 return {count,total:rows.length,made,chances,conversion:count&&chances>0?made/chances*100:null,inconsistent,zero};
}
