export function contextSeason(row:Record<string,any>):string {
  for(const key of ['season_id','season','season_year']) {
    const raw=String(row[key]??'').trim();
    const full=raw.match(/^(\d{4})-(\d{2}|\d{4})$/);
    if(full&&Number(full[2].slice(-2))===(Number(full[1])+1)%100)return `${full[1]}-${full[2].slice(-2)}`;
    const code=raw.match(/^2(\d{4})$/), year=code?.[1]??(/^\d{4}$/.test(raw)?raw:null);
    if(year)return `${year}-${String(Number(year)+1).slice(-2)}`;
  }
  const date=row.game_date instanceof Date?row.game_date.toISOString().slice(0,10):String(row.game_date??'').slice(0,10);
  const year=Number(date.slice(0,4)),month=Number(date.slice(5,7));
  if(year<1900||month<1||month>12)return '';
  const start=month>=10?year:year-1;
  return `${start}-${String(start+1).slice(-2)}`;
}
function first(...values:any[]){return values.find(value=>value!=null&&String(value).trim()!=='')??null;}
function number(value:any):number|null {
  if(value==null||String(value).trim()==='')return null;
  const text=String(value);
  const mmss=text.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if(mmss){const seconds=Number(mmss[2]);return seconds<60?Number(mmss[1])+seconds/60:null;}
  const parsed=Number(value);return Number.isFinite(parsed)&&parsed>=0?parsed:null;
}
function phase(raw:any,gameId:string):string|null {
  const value=String(raw??'').trim().toLowerCase();
  if(value==='regular'||value==='regular season'||value==='regularseason')return 'Regular Season';
  if(value==='playoff'||value==='playoffs')return 'Playoffs';
  if(value==='preseason'||value==='pre season')return 'Preseason';
  if(!value){if(gameId.startsWith('002'))return 'Regular Season';if(gameId.startsWith('004'))return 'Playoffs';if(gameId.startsWith('001'))return 'Preseason';}
  return value?String(raw):null;
}
export function normalizeContextGames(rows:Record<string,any>[]) {
  const seen=new Set<string>();
  return rows.flatMap(row=>{
    const split=String(row.split_code??'').toUpperCase();
    if(split&&!['FULL','FULL_GAME','GAME'].includes(split))return [];
    const rawId=String(row.game_id??'').trim();
    const game_id=/^\d+$/.test(rawId)?rawId.padStart(10,'0'):rawId;
    const game_date=row.game_date instanceof Date?row.game_date.toISOString().slice(0,10):String(row.game_date??'').slice(0,10);
    if(!game_id||!/^\d{4}-\d{2}-\d{2}$/.test(game_date)||!Number.isFinite(Date.parse(game_date)))return [];
    if(seen.has(game_id))return [];seen.add(game_id);
    const season=contextSeason(row);
    const team_abbreviation=first(row.team_abbreviation,row.team_abbr,row.team);
    const matchup=first(row.matchup_clean,row.matchup);
    const opponent=first(row.opponent_abbr,row.opponent_clean,row.opponent,row.opponent_team);
    const min=number(first(row.min_clean,row.minutes_clean,row.min_decimal,row.minutes_decimal,row.min,row.minutes,row.minutes_played,row.mp,row.min_text));
    const output:Record<string,any>={game_id,game_date,season,season_type:phase(first(row.season_type,row.season_type_clean),game_id),team_abbreviation,matchup,opponent_abbr:opponent,home_away:first(row.home_away_clean,row.home_away),wl:row.wl??null,min};
    for(const key of ['pts','reb','ast','tov','fgm','fga','fg3m','fg3a','fta','usage_pct','touches','rebound_chances','potential_ast','passes_made']){
      const alias=key==='potential_ast'?row.pot_ast:key==='rebound_chances'?row.reb_chances:key==='usage_pct'?row.usg_pct:undefined;
      output[key]=number(first(row[key],alias));
    }
    return [output];
  }).sort((a,b)=>b.game_date.localeCompare(a.game_date));
}
