import prisma from '@/lib/prisma';
import { normalizeContextGames } from './nbaContextNormalize';
export async function loadContextGames(playerId:number,season:string, db: Pick<typeof prisma, "$queryRawUnsafe"> = prisma) {
  const failures:string[]=[];
  const seasons=new Set<string>();
  for(const source of ['public.player_page_game_fact_cache','public.player_game_logs']) {
    try {
      // Same ID and canonical source as getPlayerDataFast. Bound the read to this player.
      const raw=await db.$queryRawUnsafe<any[]>(`select * from ${source} where player_id=$1::bigint order by game_date desc limit 2000`,playerId);
      const all=normalizeContextGames(raw);
      for(const row of all)seasons.add(row.season);
      const games=all.filter(row=>row.season===season);
      if(games.length)return {games,source,seasons:[...seasons].sort().reverse(),failures};
    }catch{failures.push(source);}
  }
  return {games:[],source:null,seasons:[...seasons].sort().reverse(),failures};
}
