import prisma from './prisma';
import {Prisma} from '@prisma/client';
import {canonicalOddsPlayerName,oddsPlayerNameCandidates,matchesOddsPlayer} from './oddsPlayerNames';
import {groupUniversalQuotes,oddsBook,type PriceQuote} from './nbaOdds';
export type StakePlayerOdd=PriceQuote;
export type PlayerOddsSnapshot={odds:PriceQuote[];availability:'ready'|'unavailable';reason:'OK'|'SOURCE_UNAVAILABLE'|'CANDIDATE_LIMIT'};
const cache=new Map<string,{until:number;value:Promise<PlayerOddsSnapshot>}>();
export function getPlayerOddsSnapshot(playerName:string,options:{books?:string[]}={}):Promise<PlayerOddsSnapshot>{
 const target=canonicalOddsPlayerName(playerName),books=[...new Set((options.books??[]).map(oddsBook).filter((b):b is string=>!!b))].sort();
 if(!target)return Promise.resolve({odds:[],availability:'ready',reason:'OK'});
 const key=JSON.stringify([target,books]),old=cache.get(key);if(old&&old.until>Date.now())return old.value;
 const value=(async():Promise<PlayerOddsSnapshot>=>{try{
  const names=oddsPlayerNameCandidates(target),filter=books.length?Prisma.sql`AND lower(book) IN (${Prisma.join(books)})`:Prisma.empty;
  const rows=await prisma.$queryRaw<{row:Record<string,unknown>}[]>(Prisma.sql`SELECT to_jsonb(o) AS row
   FROM public.latest_player_prop_odds_cache o WHERE lower(btrim(player_norm)) IN (${Prisma.join(names)}) ${filter}
   ORDER BY scraped_at_utc DESC LIMIT 4001`);
  if(rows.length>4000)return {odds:[],availability:'unavailable',reason:'CANDIDATE_LIMIT'};
  return {odds:groupUniversalQuotes(rows.map(x=>x.row).filter(row=>matchesOddsPlayer(row.jugador,row.player_norm,target))),availability:'ready',reason:'OK'};
 }catch{return {odds:[],availability:'unavailable',reason:'SOURCE_UNAVAILABLE'};}})();
 if(cache.size>=32)cache.delete(cache.keys().next().value!);cache.set(key,{until:Date.now()+30000,value});
 void value.then(result=>{if(result.availability==='unavailable'&&cache.get(key)?.value===value)cache.delete(key);});return value;
}
export async function getPlayerOddsMultiBook(playerName:string,options:{books?:string[]}={}):Promise<StakePlayerOdd[]>{return (await getPlayerOddsSnapshot(playerName,options)).odds;}
export async function getPlayerStakeOdds(playerName:string):Promise<StakePlayerOdd[]>{return getPlayerOddsMultiBook(playerName,{books:['stake']});}
