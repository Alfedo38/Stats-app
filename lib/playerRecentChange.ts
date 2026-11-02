import {EVIDENCE_METRICS,evidenceMetricIds,evidenceReading,evidenceValue,summarizeEvidence,type EvidenceMetric,type EvidenceRow} from './marketEvidence';
import {gamePhase} from './nbaGameFilters';
import {normalizeDateOnly} from './formatters';
import {isDate,TEAMS} from './ticketReader/model';

export const SECONDARY_IDS=['minutes','fga','fta','fg3a','fg3m','fgm','ftm','potential_ast','rebound_chances','touches','pts','reb','ast'] as const;
export type SecondaryMetric=typeof SECONDARY_IDS[number];
export type SecondaryChoice='auto'|'none'|SecondaryMetric;
export function parseSecondary(value:unknown):SecondaryChoice{return value==='none'||value==='auto'||SECONDARY_IDS.includes(value as SecondaryMetric)?value as SecondaryChoice:'auto';}
export function secondaryOptions(market:string){const main=evidenceMetricIds(market).filter(id=>!EVIDENCE_METRICS[id]?.numerator);return [...new Set([...main,...SECONDARY_IDS])].filter(id=>SECONDARY_IDS.includes(id as SecondaryMetric)&&id!==market).map(id=>EVIDENCE_METRICS[id]);}
export function validSecondaryChoice(market:string,choice:SecondaryChoice):SecondaryChoice{return choice==='auto'||choice==='none'||secondaryOptions(market).some(m=>m.id===choice)?choice:'auto';}
export function selectedSecondary(market:string,choice:SecondaryChoice,scope:string='FULL'):EvidenceMetric|null{
 choice=validSecondaryChoice(market,choice);
 if(scope!=='FULL'||choice==='none')return null;
 const main=evidenceMetricIds(market),automatic=main.find(id=>!['minutes',market].includes(id)&&SECONDARY_IDS.includes(id as SecondaryMetric)&&!EVIDENCE_METRICS[id]?.numerator)??'minutes';
 const id=choice==='auto'?automatic:choice;
 return secondaryOptions(market).find(m=>m.id===id)??null;
}
export function secondaryAxis(market:string,secondary:string|null|undefined):'left'|'right'{
 const pairs=[['ast','potential_ast'],['reb','rebound_chances'],['fg3m','fg3a'],['fgm','fga'],['ftm','fta']];
 return pairs.some(pair=>pair.includes(market)&&pair.includes(secondary??''))?'left':'right';
}
export function secondaryValue(row:EvidenceRow,id:string){const metric=EVIDENCE_METRICS[id];return metric?evidenceReading(row,metric,'FULL').value:null;}
function season(date:string){const y=Number(date.slice(0,4))-(Number(date.slice(5,7))<10?1:0);return `${y}-${String(y+1).slice(-2)}`;}
function team(row:EvidenceRow){const value=String(row.team_abbreviation??row.team_abbr??row.team??'').trim().toUpperCase();return TEAMS.includes(value)?value:null;}
function identity(row:EvidenceRow,cutoff?:string|null,playerId?:string|number|null){
 const raw=String(row.game_id??row.game_key??'').trim(),id=/^\d{1,15}$/.test(raw)?raw.replace(/^0+/,''):'';
 const date=normalizeDateOnly(row.game_date??row.date)??'',scope=String(row.period_scope??row.split_code??'FULL').toUpperCase();
 const own=row.player_id??row.playerId;
 if(!id||!isDate(date)||cutoff&&date>=cutoff||!['FULL','FULL_GAME','GAME','PARTIDO'].includes(scope)||own!=null&&playerId!=null&&String(own)!==String(playerId)||evidenceValue(row,'minutes')===0)return null;
 const explicit=String(row.season_type??row.seasonType??row.game_type??'').toLowerCase();
 const known=['regular season','regular','rs','temporada regular','playoffs','playoff','postseason'];
 const phase=explicit&&!known.includes(explicit)?null:gamePhase(row);
 return {id,date,team:team(row),phase:phase==='Regular Season'||phase==='Playoffs'?phase:null,season:season(date),row};
}
type Item=NonNullable<ReturnType<typeof identity>>;
function prepare(rows:EvidenceRow[],cutoff?:string|null,playerId?:string|number|null,reference=false){
 const unique=new Map<string,Item>(),conflicts=new Set<string>();let invalid=0;
 const signature=(x:Item)=>JSON.stringify([x.date,x.team,x.phase,...(reference?[]:['minutes','pts','reb','ast','fga','fgm','fg3m','fg3a','fta','ftm','potential_ast','rebound_chances','touches'].map(k=>evidenceValue(x.row,k)))]);
 for(const row of rows){const item=identity(row,cutoff,playerId);if(!item){invalid++;continue;}const previous=unique.get(item.id);if(previous&&signature(previous)!==signature(item))conflicts.add(item.id);else unique.set(item.id,item);}
 return {items:[...unique.values()].filter(x=>!conflicts.has(x.id)).sort((a,b)=>a.date.localeCompare(b.date)||Number(a.id)-Number(b.id)),invalid,conflicts:conflicts.size};
}
export function recentChange(rows:EvidenceRow[],market:string,options:{referenceRows?:EvidenceRow[];cutoff?:string|null;playerId?:string|number|null}={}){
 const source=prepare(rows,options.cutoff,options.playerId),reference=prepare(options.referenceRows??rows,options.cutoff,options.playerId,true),anchor=reference.items.at(-1);
 let segment:Item[]=[];
 if(anchor?.team&&anchor.phase){for(const item of [...reference.items].reverse()){if(item.team!==anchor.team||item.phase!==anchor.phase||item.season!==anchor.season)break;segment.push(item);}}
 const since=segment.at(-1)?.date??null;
 const cohort=since?source.items.filter(x=>x.team===anchor!.team&&x.phase===anchor!.phase&&x.season===anchor!.season&&x.date>=since):[];
 const newest=[...cohort].reverse(),recent=newest.slice(0,5).map(x=>x.row),previous=newest.slice(5,20).map(x=>x.row);
 const metrics=evidenceMetricIds(market).map(id=>{
  const metric=EVIDENCE_METRICS[id],current=summarizeEvidence(recent,metric),prior=summarizeEvidence(previous,metric),comparable=current.count>=5&&prior.count>=5;
  const delta=comparable?current.average!-prior.average!:null;
  return {metric,current,previous:prior,comparable,delta,relative:delta!==null&&prior.average!==null&&prior.average>0?delta/prior.average*100:null};
 });
 const paired=pairedProduction(recent,previous,market);
 return {version:1 as const,team:anchor?.team??null,phase:anchor?.phase??null,season:anchor?.season??null,since,knownContext:!!since,
  recent,previous,metrics,paired,excluded:source.items.length-cohort.length,invalid:source.invalid,conflicts:source.conflicts,
  status:!since?'unknown_context':recent.length<5||previous.length<5?'small_sample':'ready',
  ranges:{recent:range(recent),previous:range(previous)},cutoff:options.cutoff??null};
}
function range(rows:EvidenceRow[]){const days=rows.map(row=>normalizeDateOnly(row.game_date??row.date)!).sort();return days.length?{first:days[0],last:days.at(-1)!}:null;}
function pairedProduction(recent:EvidenceRow[],previous:EvidenceRow[],market:string){
 const ids=evidenceMetricIds(market),ratio=ids.map(id=>EVIDENCE_METRICS[id]).find(m=>m.numerator&&m.denominator);if(!ratio)return null;
 const summarize=(rows:EvidenceRow[])=>{const valid=rows.filter(row=>evidenceReading(row,ratio).value!==null),conversion=summarizeEvidence(valid,ratio);return {count:valid.length,produced:summarizeEvidence(valid,EVIDENCE_METRICS[ratio.numerator!]).average,opportunities:summarizeEvidence(valid,EVIDENCE_METRICS[ratio.denominator!]).average,conversion:conversion.average};};
 const current=summarize(recent),prior=summarize(previous);return {numerator:ratio.numerator!,denominator:ratio.denominator!,current,previous:prior,comparable:current.count>=5&&prior.count>=5};
}
