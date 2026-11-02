/** Criterios de la ficha; los valores estadísticos siempre se vuelven a leer en servidor. */
export type PageSample = {
  version: 1; playerId: string; eventDate: string; cutoffDate:string; scope: 'FULL'|'Q1'|'H1'|'H2_REG';
  phase: 'ALL'|'Regular Season'|'Playoffs'; seasons: 'all'|'last2';
  homeAway: 'HOME'|'AWAY'|null; opponent: string|null; minMinutes: number|null;
  labels: string[]; gameIds?: string[];
};
const teams=new Set('ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS'.split(' '));
export function sampleGameKey(value:unknown){
 const raw=String(value??'').trim();return /^\d{1,15}$/.test(raw)?raw.replace(/^0+/,'')||'0':'';
}
function day(value:unknown):value is string {
 return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
}
export function cleanPageSample(value:unknown):PageSample|undefined {
 if(value===undefined)return;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('SAMPLE_INVALID');
 const x=value as PageSample;
 if(x.version!==1||typeof x.playerId!=='string'||!/^\d{1,13}$/.test(x.playerId)||Number(x.playerId)<=0||!day(x.eventDate)||!day(x.cutoffDate)||x.cutoffDate>x.eventDate||!['FULL','Q1','H1','H2_REG'].includes(x.scope)||!['ALL','Regular Season','Playoffs'].includes(x.phase)||!['all','last2'].includes(x.seasons)||x.homeAway!==null&&!['HOME','AWAY'].includes(x.homeAway)||x.opponent!==null&&!teams.has(x.opponent)||x.minMinutes!==null&&(typeof x.minMinutes!=='number'||!Number.isFinite(x.minMinutes)||x.minMinutes<0||x.minMinutes>60)||!Array.isArray(x.labels)||x.labels.length>12||x.labels.some(l=>typeof l!=='string'||l.length>100)||x.gameIds!==undefined&&(!Array.isArray(x.gameIds)||x.gameIds.length>1000||x.gameIds.some(id=>typeof id!=='string'||!sampleGameKey(id))))throw Error('SAMPLE_INVALID');
 return {version:1,playerId:x.playerId,eventDate:x.eventDate,cutoffDate:x.cutoffDate,scope:x.scope,phase:x.phase,seasons:x.seasons,homeAway:x.homeAway,opponent:x.opponent,minMinutes:x.minMinutes,labels:[...new Set(x.labels)],...(x.gameIds!==undefined?{gameIds:[...new Set(x.gameIds.map(sampleGameKey))]}:{})};
}
export function pageSampleRows<T extends Record<string,unknown>>(rows:T[],sample:PageSample):T[]{
 const ids=sample.gameIds===undefined?null:new Set(sample.gameIds);
 return rows.filter(row=>{
  if(ids&&!ids.has(sampleGameKey(row.game_id)))return false;
  const matchup=String(row.matchup_clean??row.matchup??'').toUpperCase();
  const venue=String(row.home_away_clean??row.home_away??'').toUpperCase();
  const homeAway=venue==='HOME'||venue==='H'? 'HOME':venue==='AWAY'||venue==='A'?'AWAY':matchup.includes('@')?'AWAY':/\bVS\.?\s/.test(matchup)?'HOME':null;
  if(sample.homeAway&&homeAway!==sample.homeAway)return false;
  const opponent=String(row.opponent_clean??row.opponent_abbr??row.opponent??'').toUpperCase()||matchup.match(/(?:@|VS\.?)\s*([A-Z]{3})\b/)?.[1];
  return !sample.opponent||opponent===sample.opponent;
 });
}
export function contextSeason(date?:string|null){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const part=(name:string)=>parts.find(p=>p.type===name)?.value??'';
 const at=day(date)?date:`${part('year')}-${part('month')}-${part('day')}`;
 const year=Number(at.slice(0,4))-(Number(at.slice(5,7))<10?1:0);return `${year}-${String((year+1)%100).padStart(2,'0')}`;
}
export function contextGames<T extends {id:string;seasonType:string;opponent:string;date:string}>(games:T[],options:{ids:Set<string>|null;phase:string;opponent:string;rivalOnly:boolean;range:number}){
 const rows=games.filter(game=>(!options.ids||options.ids.has(sampleGameKey(game.id)))&&(options.phase==='ALL'||game.seasonType===options.phase)&&(!options.rivalOnly||options.opponent==='ALL'||game.opponent===options.opponent)).sort((a,b)=>b.date.localeCompare(a.date)||sampleGameKey(b.id).localeCompare(sampleGameKey(a.id)));
 return options.range>0?rows.slice(0,options.range):rows;
}
