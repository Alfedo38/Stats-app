import 'server-only';
import prisma from '@/lib/prisma';
import {oddsPlayerNameCandidates} from '../oddsPlayerNames';
import {selectQuote} from './quoteMatch';
import type {Leg,QuoteInfo,QuoteDiagnostic} from './model';

const publicationCache=new Map<string,{until:number;value:Promise<NonNullable<QuoteDiagnostic['publication']>>}>();
const bookFilter="(regexp_replace(lower(book),'[^a-z0-9]','','g')=ANY($1::text[]) OR regexp_replace(lower(book),'[^a-z0-9]','','g') LIKE $2::text)";
function bookKeys(leg:Leg){return leg.book==='stake'?['stake','ste']:leg.book==='betano'?['betano','bto']:['bet365','365'];}
async function publication(leg:Leg){
 const key=leg.book+'|'+leg.eventDate,old=publicationCache.get(key);if(old&&old.until>Date.now())return old.value;
 const value=(async()=>{
  const unknown={available:false,bookRows:0,dateRows:0,undatedRows:0,latestCapturedAt:null};
  try{
   const dateExpr="coalesce(nullif(to_jsonb(o)->>'event_date',''),nullif(to_jsonb(o)->>'game_date',''))";
   const rows=await prisma.$queryRawUnsafe<{book_rows:number;date_rows:number;undated_rows:number;latest:Date|string|null}[]>(`SELECT count(*)::int AS book_rows,count(*) FILTER (WHERE left(${dateExpr},10)=$3::text)::int AS date_rows,count(*) FILTER (WHERE ${dateExpr} IS NULL)::int AS undated_rows,max(scraped_at_utc) AS latest FROM public.latest_player_prop_odds_cache o WHERE ${bookFilter}`,bookKeys(leg),leg.book+'%',leg.eventDate);
   const row=rows[0];if(!row||![row.book_rows,row.date_rows,row.undated_rows].every(n=>Number.isInteger(n)&&n>=0))return unknown;
   const at=row.latest===null?null:new Date(row.latest);return {available:true,bookRows:row.book_rows,dateRows:row.date_rows,undatedRows:row.undated_rows,latestCapturedAt:at&&Number.isFinite(at.getTime())?at.toISOString():null};
  }catch{return unknown;}
 })();publicationCache.set(key,{until:Date.now()+60000,value});if(publicationCache.size>16)publicationCache.delete(publicationCache.keys().next().value!);return value;
}

export async function lookupQuote(leg:Leg):Promise<QuoteInfo>{
 if(leg.book==='unknown')return {status:'not_found',message:'Elegí una casa para buscar su cuota individual.',diagnostic:{reason:'BOOK_REQUIRED'}};
 try{
  const rows=await prisma.$queryRawUnsafe<{row:Record<string,unknown>}[]>(
   `SELECT to_jsonb(o) AS row FROM public.latest_player_prop_odds_cache o WHERE ${bookFilter} AND lower(btrim(player_norm))=ANY($3::text[]) ORDER BY scraped_at_utc DESC LIMIT 4001`,bookKeys(leg),leg.book+'%',oddsPlayerNameCandidates(leg.playerName));
  if(rows.length>4000)return {status:'unavailable',message:'La consulta de cuotas devolvió demasiados candidatos para verificar un precio.',diagnostic:{reason:'CANDIDATE_LIMIT'}};
  const quote=selectQuote(rows.map(x=>x.row),leg);
  if(!rows.length){
   const published=await publication(leg),reason=published.available&&published.bookRows===0?'BOOK_EMPTY':published.available&&published.dateRows===0&&published.undatedRows===0?'DATE_NOT_PUBLISHED':'PLAYER_NOT_FOUND';
   return {...quote,message:reason==='BOOK_EMPTY'?'Todavía no hay cuotas publicadas de esta casa.':reason==='DATE_NOT_PUBLISHED'?'La caché de esta casa no tiene cuotas para la fecha del ticket.':quote.message,diagnostic:{...quote.diagnostic,reason,publication:published}};
  }
  return quote;
 }catch{return {status:'unavailable',message:'No se pudo consultar la caché de cuotas. El análisis histórico se conserva; no se inventa un precio.',diagnostic:{reason:'SOURCE_UNAVAILABLE'}};}
}
