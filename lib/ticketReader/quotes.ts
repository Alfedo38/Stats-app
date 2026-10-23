import 'server-only';
import prisma from '@/lib/prisma';
import {oddsPlayerNameCandidates} from '../oddsPlayerNames';
import {selectQuote} from './quoteMatch';
import type {Leg,QuoteInfo} from './model';

export async function lookupQuote(leg:Leg):Promise<QuoteInfo>{
 if(leg.book==='unknown')return {status:'not_found',message:'Elegí una casa para buscar su cuota individual.'};
 try{
  const rows=await prisma.$queryRawUnsafe<{row:Record<string,unknown>}[]>(
   'SELECT to_jsonb(o) AS row FROM public.latest_player_prop_odds_cache o WHERE lower(book) = $1::text AND player_norm = ANY($2::text[]) ORDER BY scraped_at_utc DESC LIMIT 4000',leg.book,oddsPlayerNameCandidates(leg.playerName));
  return selectQuote(rows.map(x=>x.row),leg);
 }catch{return {status:'unavailable',message:'No se pudo consultar la caché de cuotas. El análisis histórico se conserva; no se inventa un precio.'};}
}
