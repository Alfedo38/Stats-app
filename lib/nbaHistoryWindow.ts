/** Ventana de dos temporadas anclada al evento, nunca a las últimas con datos. */
export function historyReferenceDate(value?:string|null):string {
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value)return value;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const part=(type:string)=>parts.find(p=>p.type===type)?.value??'';return `${part('year')}-${part('month')}-${part('day')}`;
}
export function historySeasons(reference?:string|null):[string,string]{
 const at=historyReferenceDate(reference),year=Number(at.slice(0,4))-(Number(at.slice(5,7))<10?1:0);
 const season=(y:number)=>`${y}-${String((y+1)%100).padStart(2,'0')}`;return [season(year),season(year-1)];
}
export function matchupSeasons(reference?:string|null):[string,string,string,string]{
 const [current,previous]=historySeasons(reference),year=Number(current.slice(0,4));
 const season=(y:number)=>`${y}-${String((y+1)%100).padStart(2,'0')}`;
 return [current,previous,season(year-2),season(year-3)];
}
export function twoSeasonRows<T extends {game_date?:unknown;date?:unknown}>(rows:T[],reference?:string|null):T[]{
 const seasons=historySeasons(reference),start=`${seasons[1].slice(0,4)}-10-01`,end=`${Number(seasons[0].slice(0,4))+1}-10-01`;
 return rows.filter(row=>{const raw=row.game_date??row.date,date=raw instanceof Date?raw.toISOString().slice(0,10):String(raw??'').slice(0,10);const parsed=Date.parse(date+'T12:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===date&&date>=start&&date<end;});
}

export type PlayerSeasonWindow='current'|'previous'|'last2';
export function playerSeasonWindow(value:unknown):PlayerSeasonWindow {
 return value==='previous'||value==='last2'?value:'current';
}
export function playerWindowRows<T extends {game_date?:unknown;date?:unknown}>(rows:T[],reference:string|null|undefined,window:PlayerSeasonWindow,rival:boolean,full=true):T[]{
 const seasons=historySeasons(reference);
 const chosen=rival?(full?matchupSeasons(reference):seasons):window==='last2'?seasons:[seasons[window==='previous'?1:0]];
 const start=chosen.at(-1)!.slice(0,4)+'-10-01',end=(Number(chosen[0].slice(0,4))+1)+'-10-01';
 return rows.filter(row=>{
  const raw=row.game_date??row.date,date=raw instanceof Date&&Number.isFinite(raw.getTime())?raw.toISOString().slice(0,10):String(raw??'').slice(0,10);
  const parsed=Date.parse(date+'T12:00:00Z');
  return date>=start&&date<end&&(!reference||date<reference)&&Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===date;
 });
}
