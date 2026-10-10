export type PeriodScope='FULL'|'Q1'|'H1'|'H2_REG';
const ALIASES:Record<string,string[]>={
  fg3m:['fg3m','3ptm','3pt','3pm','three_pm'], fg3a:['fg3a','3pta','three_pa'],
  tov:['tov','to','turnovers'], pr:['pr','pts_reb','pts+reb'],pa:['pa','pts_ast','pts+ast'],ra:['ra','reb_ast','reb+ast'],pra:['pra','pts_reb_ast','pts+reb+ast'],stl_blk:['stl_blk','stocks'],
  usage_pct:['usage_pct','usg_pct'],potential_ast:['potential_ast','pot_ast'],rebound_chances:['rebound_chances','reb_chances']
};
const FIELDS=['pts','reb','ast','oreb','dreb','stl','blk','tov','pf','fgm','fga','fg3m','fg3a','ftm','fta','pr','pa','ra','pra','stl_blk','usage_pct','touches','potential_ast','rebound_chances','passes_made','fg_pct','fg3_pct'];
export function periodCode(value:unknown):PeriodScope|null {
 const raw=String(value??'').toUpperCase().trim();
 if(['FULL','FULL_GAME','GAME','PARTIDO'].includes(raw))return 'FULL';
 if(raw==='Q1')return 'Q1';if(raw==='H1')return 'H1';if(['H2','H2_REG'].includes(raw))return 'H2_REG';return null;
}
function num(value:unknown):number|null {
 if(value==null||String(value).trim()===''||typeof value==='boolean')return null;
 const n=Number(value);return Number.isFinite(n)?n:null;
}
function take(row:Record<string,any>,keys:string[]):number|null {for(const key of keys){const value=num(row[key]);if(value!==null)return value;}return null;}
function keys(stat:string):string[]{const canonical=Object.keys(ALIASES).find(key=>ALIASES[key].includes(stat));return canonical?ALIASES[canonical]:[stat];}
function prefix(scope:PeriodScope){return scope==='Q1'?'q1':scope==='H1'?'h1':scope==='H2_REG'?'h2':'';}
export function periodMetricValue(row:Record<string,any>,stat:string,scope:PeriodScope):number|null {
 if(stat.includes('+')){const values=stat.split('+').map(key=>periodMetricValue(row,key,scope));return values.some(v=>v===null)?null:values.reduce<number>((sum,v)=>sum+v!,0);}
 const direct=keys(stat),isLong=scope!=='FULL'&&periodCode(row.split_code)===scope;
 const candidates=scope==='FULL'||isLong?direct:direct.map(key=>`${prefix(scope)}_${key}`);
 const value=take(row,candidates);
 return value!==null&&stat==='usage_pct'&&value<=1?value*100:value;
}
function id(row:Record<string,any>){const raw=String(row.game_id??row.game_id_nozero??row.game_key??row.game_date??row.id??'');return /^\d+$/.test(raw)?raw.replace(/^0+/,'')||'0':raw;}
function first(...values:any[]){return values.find(v=>v!=null&&String(v).trim()!=='')??null;}
function clean(base:Record<string,any>,part:Record<string,any>,scope:PeriodScope,wide:boolean){
 const output:Record<string,any>={...base,...part,split_code:scope,period_scope:scope};
 const px=prefix(scope);
 for(const field of FIELDS){const names=keys(field).map(key=>wide?`${px}_${key}`:key);output[field]=take(part,names);}
 for(const field of FIELDS)for(const alias of keys(field))output[alias]=output[field];
 const minutes=first(...(wide?[part[`${px}_min`],part[`${px}_minutes`],part[`${px}_min_text`]]:[part.min_clean,part.minutes_clean,part.min,part.minutes,part.min_text]));
 for(const field of ['min','minutes','min_clean','minutes_clean','min_decimal','minutes_decimal','minutes_played','min_sec','period_minutes','mp','mins','min_text'])output[field]=minutes;
 return output;
}
function complete(row:Record<string,any>){
 for(const [key,parts]of [['pr',['pts','reb']],['pa',['pts','ast']],['ra',['reb','ast']],['pra',['pts','reb','ast']],['stl_blk',['stl','blk']]] as [string,string[]][]){if(row[key]===null&&parts.every(p=>num(row[p])!==null))row[key]=parts.reduce((sum,p)=>sum+Number(row[p]),0);}
 for(const field of FIELDS)for(const alias of keys(field))row[alias]=row[field];
 return row;
}
export function buildPeriodRows(raw:Record<string,any>[],splits:Record<string,any>[],scope:PeriodScope,stat:string){
 if(scope==='FULL')return raw.filter(row=>(!row.split_code||periodCode(row.split_code)==='FULL')&&periodMetricValue(row,stat,'FULL')!==null);
 const bases=new Map<string,Record<string,any>>();for(const row of raw){const key=id(row);if(key&&(!bases.has(key)||!row.split_code||periodCode(row.split_code)==='FULL'))bases.set(key,row);}
 const merged=new Map<string,Record<string,any>>();
 function add(part:Record<string,any>,wide:boolean){
   const key=id(part);if(!key)return;
   const base=bases.get(key)??{};
   const candidate=clean(base,part,scope,wide);
   if(!FIELDS.some(field=>candidate[field]!==null)&&candidate.min===null)return;
   const previous=merged.get(key);
   if(previous){for(const field of FIELDS)if(previous[field]===null&&candidate[field]!==null)previous[field]=candidate[field];if(previous.min===null&&candidate.min!==null){for(const field of ['min','minutes','min_clean','minutes_clean','min_decimal','minutes_decimal','minutes_played','min_sec','period_minutes','mp','mins','min_text'])previous[field]=candidate.min;}}
   else merged.set(key,candidate);
 }
 // Explicit period rows, then SSR prefixed values, then missing fields from API cache.
 for(const row of raw)if(periodCode(row.split_code)===scope)add(row,false);
 for(const row of raw)if(!row.split_code||periodCode(row.split_code)==='FULL')add(row,true);
 for(const row of splits)if(periodCode(row.split_code)===scope)add(row,false);
 return [...merged.values()].map(complete).filter(row=>periodMetricValue(row,stat,scope)!==null);
}
