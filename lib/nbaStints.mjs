// Input contract: one complete team timeline per game, individual box stats in each stint.
export function validateStintGame(game) {
  const fail=message=>{throw new Error(message)};
  if(!game||!/^\d{10}$/.test(game.game_id??'')||!/^\d{4}-\d{2}$/.test(game.season??'')||!['Regular Season','Playoffs'].includes(game.season_type)||!/^\d{4}-\d{2}-\d{2}$/.test(game.game_date??'')||!Number.isFinite(Date.parse(game.game_date))||!['ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK','OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WAS'].includes(game.team_abbr)||typeof game.source!=='string'||!game.source.trim())fail('Metadatos del partido inválidos.');
  if(!Number.isInteger(game.game_seconds)||game.game_seconds<2880||(game.game_seconds-2880)%300!==0||!Array.isArray(game.stints)||!game.stints.length)fail('Duración o tramos inválidos.');
  const stints=[...game.stints].sort((a,b)=>a.start_seconds-b.start_seconds), totals=new Map();
  let cursor=0;
  for(const stint of stints){
    if(!Number.isFinite(stint.start_seconds)||!Number.isFinite(stint.end_seconds)||stint.start_seconds!==cursor||stint.end_seconds<=cursor||stint.end_seconds>game.game_seconds)fail('La cronología debe ser completa, continua y sin solapamientos.');
    cursor=stint.end_seconds;
    if(!Array.isArray(stint.lineup)||stint.lineup.length!==5||new Set(stint.lineup).size!==5||stint.lineup.some(id=>!Number.isSafeInteger(id)||id<=0))fail('Cada quinteto necesita cinco IDs diferentes.');
    if(!stint.stats||Object.keys(stint.stats).length!==5||Object.keys(stint.stats).some(id=>!stint.lineup.includes(Number(id))))fail('Se requieren estadísticas para los cinco jugadores en cancha.');
    for(const id of stint.lineup){
      const stats=stint.stats[String(id)];
      if(!stats||['pts','reb','ast','fga'].some(key=>!Number.isInteger(stats[key])||stats[key]<0))fail('Producción individual inválida.');
      const total=totals.get(id)??{seconds:0,pts:0,reb:0,ast:0,fga:0};
      total.seconds+=stint.end_seconds-stint.start_seconds;
      for(const key of ['pts','reb','ast','fga'])total[key]+=stats[key];
      totals.set(id,total);
    }
  }
  if(cursor!==game.game_seconds)fail('Falta el final del partido.');
  return {stints,totals};
}
export function reconcileStints(totals,logs){
  const box=new Map(logs.map(log=>[Number(log.player_id),log]));
  for(const [id,total]of totals){
    const log=box.get(id);if(!log)throw new Error(`Falta box score del jugador ${id}.`);
    if(log.min==null||!Number.isFinite(Number(log.min))||Math.abs(Number(log.min)*60-total.seconds)>6)throw new Error(`Minutos no conciliados para ${id}.`);
    for(const key of ['pts','reb','ast','fga'])if(log[key]==null||Number(log[key])!==total[key])throw new Error(`No coincide ${key} para ${id}.`);
  }
  for(const log of logs)if(Number(log.min)>0&&!totals.has(Number(log.player_id)))throw new Error(`Faltan tramos del jugador ${log.player_id}.`);
}
