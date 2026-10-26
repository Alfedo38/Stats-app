export type AbsenceScope='current'|'historical';
export const ABSENCE_TEAMS=['ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK','OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WAS'];
export function absenceTeam(value:unknown){const team=String(value??'').trim().toUpperCase();return ABSENCE_TEAMS.includes(team)?team:'';}
export function absenceScope(value:unknown,legacyLink=false):AbsenceScope{return value==='historical'||(value==null&&legacyLink)?'historical':'current';}
// Preserve suffixes and distinct identities such as Jalen/Jaylin.
export function absenceName(value:unknown){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');}
export function absenceEmptyMessage(names:string[],matches:Record<string,string[]>|null):string|null{
 if(!names.length||!matches||names.some(name=>!Object.hasOwn(matches,name)))return null;
 const sets=names.map(name=>new Set(matches[name].map(id=>String(id).replace(/^0+/,''))));
 if(sets.some(ids=>ids.size===0))return 'Sin partidos con ausencia confirmada para alguna de las selecciones en este contexto.';
 if(![...sets[0]].some(id=>sets.every(ids=>ids.has(id))))return 'Hay ausencias registradas, pero no hay partidos donde falten todos a la vez.';
 return null;
}
export function rosterReferenceWarning(reference:string,today:string):string|null{
 const day=Date.parse(reference+'T00:00:00Z'),now=Date.parse(today+'T00:00:00Z');
 if(!Number.isFinite(day)||!Number.isFinite(now))return 'No se pudo comprobar la fecha del plantel.';
 return now-day>7*86400000?'La referencia del plantel tiene más de 7 días. Conviene actualizarla.':null;
}
export type RecordedAbsence={name:string;team:string;games:number};
export type AbsenceOption={id:number|null;name:string;teams:string[];games:number|null;hasRecords:boolean;aliases:string[]};
export type AbsenceRosterPlayer={player_id:number;full_name:string;team_abbreviation:string};
export function absenceOptions(scope:AbsenceScope,target:number,roster:AbsenceRosterPlayer[],recorded:RecordedAbsence[],team=''):AbsenceOption[]{
 const valid=recorded.filter(r=>typeof r.name==='string'&&r.name.trim()&&r.name.length<=100&&absenceTeam(r.team)&&(!team||r.team===team));
 if(scope==='current'){
  const unique=new Map(roster.filter(p=>p.player_id!==target&&p.team_abbreviation===team).map(p=>[p.player_id,p]));
  return [...unique.values()].map(p=>{
   const matches=valid.filter(r=>absenceName(r.name)===absenceName(p.full_name));
   return {id:p.player_id,name:p.full_name,teams:[team],games:matches.length===1?matches[0].games:matches.length?null:0,hasRecords:matches.some(r=>r.games>0),aliases:[...new Set([p.full_name,...matches.map(r=>r.name)])]};
  }).sort((a,b)=>a.name.localeCompare(b.name));
 }
 const options=new Map<string,AbsenceOption>();
 for(const row of valid){const key=absenceName(row.name);if(!key)continue;const previous=options.get(key),option=previous??{id:null,name:row.name,teams:[],games:row.games,hasRecords:false,aliases:[]};if(previous)option.games=null;option.hasRecords=option.hasRecords||row.games>0;option.teams=[...new Set([...option.teams,row.team])].sort();option.aliases=[...new Set([...option.aliases,row.name])];options.set(key,option);}
 return [...options.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
