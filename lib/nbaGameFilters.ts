export type NBASeasonPhase='ALL'|'Regular Season'|'Playoffs';
export const PHASE_OPTIONS=[{value:'ALL',label:'Todos'},{value:'Regular Season',label:'Temporada regular'},{value:'Playoffs',label:'Playoffs'}] as const;
export function parsePhase(raw:unknown):NBASeasonPhase{
 const text=String(raw??'').trim().toLowerCase();
 if(['regular season','regular','rs','temporada regular'].includes(text))return 'Regular Season';
 if(['playoffs','playoff','postseason'].includes(text))return 'Playoffs';
 return 'ALL';
}
export function gameKey(row:Record<string,any>){return String(row.game_id??'').trim().replace(/^0+/,'');}
export function gamePhase(row:Record<string,any>):string|null{
 const text=String(row.season_type??row.seasonType??row.game_type??'').trim().toLowerCase();
 if(text){if(['regular season','regular','rs','temporada regular'].includes(text))return 'Regular Season';if(['playoffs','playoff','postseason'].includes(text))return 'Playoffs';if(['pre season','preseason','playin','play-in','play-in tournament','all star','all-star'].includes(text))return text;}
 const id=String(row.game_id??'').trim();
 if(!/^\d{7,10}$/.test(id))return null;
 const prefix=id.padStart(10,'0').slice(0,3);
 return prefix==='002'?'Regular Season':prefix==='004'?'Playoffs':null;
}
export function phaseRows<T extends Record<string,any>>(rows:T[],phase:NBASeasonPhase){return phase==='ALL'?rows:rows.filter(row=>gamePhase(row)===phase);}
export function cleanAbsences(names:unknown):string[]{
 if(!Array.isArray(names))return [];
 const seen=new Set<string>();return names.filter((n):n is string=>typeof n==='string').map(n=>n.trim()).filter(n=>{const key=n.toLowerCase();if(!n||n.length>100||seen.has(key))return false;seen.add(key);return true;}).slice(0,8);
}
export function absenceRows<T extends Record<string,any>>(rows:T[],names:string[],matches:Record<string,string[]>|null){
 if(!names.length)return rows;
 if(!matches||names.some(name=>!Object.prototype.hasOwnProperty.call(matches,name)))return [];
 const sets=names.map(name=>new Set(matches[name].map(id=>String(id).replace(/^0+/,''))));
 return rows.filter(row=>{const key=gameKey(row);return key!==''&&sets.every(ids=>ids.has(key));});
}
// Equivalent classifier in SQL, including numeric game IDs whose leading zeroes were lost.
export function phaseSql(alias:string){
 if(!/^[a-z]+$/.test(alias))throw new Error('Alias inválido');
 const raw=`lower(coalesce(to_jsonb(${alias})->>'season_type',to_jsonb(${alias})->>'seasonType',to_jsonb(${alias})->>'game_type',''))`;
 return `case when ${raw} in ('regular season','regular','rs','temporada regular') then 'Regular Season' when ${raw} in ('playoffs','playoff','postseason') then 'Playoffs' when ${raw} in ('pre season','preseason','playin','play-in','play-in tournament','all star','all-star') then 'Other' when trim(${alias}.game_id::text) ~ '^[0-9]{7,10}$' and lpad(trim(${alias}.game_id::text),10,'0') like '002%' then 'Regular Season' when trim(${alias}.game_id::text) ~ '^[0-9]{7,10}$' and lpad(trim(${alias}.game_id::text),10,'0') like '004%' then 'Playoffs' else null end`;
}
