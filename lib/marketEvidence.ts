import { finiteStat } from './selectionStats';
import { getDateSortValue, getMinutesValue } from './formatters';
import { periodCode, periodMetricValue, type PeriodScope } from './nbaPeriodStats';

export type EvidenceRow = Record<string, any>;
export type EvidenceMetric = {
  id: string; label: string; description: string; kind?: 'number'|'percent'|'minutes';
  color: string; tracking?: boolean; numerator?: string; denominator?: string;
};
const metric = (id:string,label:string,description:string,color='#10b981',extra:Partial<EvidenceMetric>={}):EvidenceMetric => ({id,label,description,color,...extra});
export const EVIDENCE_METRICS:Record<string,EvidenceMetric> = {
  minutes:metric('minutes','Minutos','Tiempo del período elegido','#22d3ee',{kind:'minutes'}),
  pts:metric('pts','Puntos','Producción final'),
  fga:metric('fga','Intentos de campo','Volumen de tiro','#f97316'),
  fgm:metric('fgm','Tiros anotados','Producción de campo'),
  fta:metric('fta','Libres intentados','Visitas a la línea','#f97316'),
  ftm:metric('ftm','Libres anotados','Producción en libres'),
  fg3a:metric('fg3a','Triples intentados','Volumen de triples','#f97316'),
  fg3m:metric('fg3m','Triples anotados','Producción de triples'),
  fg3_rate:metric('fg3_rate','Acierto de triple','3PM / 3PA · mismos partidos','#a855f7',{kind:'percent',numerator:'fg3m',denominator:'fg3a'}),
  fg_rate:metric('fg_rate','Acierto de campo','FGM / FGA · mismos partidos','#a855f7',{kind:'percent',numerator:'fgm',denominator:'fga'}),
  ft_rate:metric('ft_rate','Acierto en libres','FTM / FTA · mismos partidos','#a855f7',{kind:'percent',numerator:'ftm',denominator:'fta'}),
  potential_ast:metric('potential_ast','Asist. potenciales','Oportunidades creadas','#14b8a6',{tracking:true}),
  ast:metric('ast','Asistencias','Producción final'),
  ast_conversion:metric('ast_conversion','Conversión de asist.','AST / potenciales · mismos partidos','#a855f7',{kind:'percent',tracking:true,numerator:'ast',denominator:'potential_ast'}),
  rebound_chances:metric('rebound_chances','Chances de rebote','Oportunidades disponibles','#14b8a6',{tracking:true}),
  reb:metric('reb','Rebotes','Producción final'),
  reb_conversion:metric('reb_conversion','Captura de rebotes','REB / chances · mismos partidos','#a855f7',{kind:'percent',tracking:true,numerator:'reb',denominator:'rebound_chances'}),
  pr:metric('pr','Puntos + rebotes','Producción combinada'),pa:metric('pa','Puntos + asist.','Producción combinada'),ra:metric('ra','Rebotes + asist.','Producción combinada'),
  stl:metric('stl','Robos','Producción defensiva'),blk:metric('blk','Tapones','Producción defensiva'),stl_blk:metric('stl_blk','Robos + tapones','Producción combinada'),
  tov:metric('tov','Pérdidas','Pérdidas registradas'),pf:metric('pf','Faltas','Faltas personales'),
  usage_pct:metric('usage_pct','Uso','Peso ofensivo','#a855f7',{kind:'percent'}),touches:metric('touches','Toques','Participación','#a855f7',{tracking:true}),
};
export function evidenceMetricIds(activeStat:string):string[] {
  const aliases:Record<string,string>={'3ptm':'fg3m','3pm':'fg3m','3pt':'fg3m','3pta':'fg3a','3pa':'fg3a',pra:'pts+reb+ast',pr:'pts+reb',pa:'pts+ast',ra:'reb+ast','stl+blk':'stl_blk',stocks:'stl_blk',to:'tov'};
  const raw=String(activeStat||'pts').toLowerCase(),stat=aliases[raw]??raw;
  if(['fg3m','fg3a'].includes(stat))return ['minutes','fg3a','fg3m','fg3_rate'];
  if(['fgm','fga'].includes(stat))return ['minutes','fga','fgm','fg_rate'];
  if(['ftm','fta'].includes(stat))return ['minutes','fta','ftm','ft_rate'];
  if(stat==='ast')return ['minutes','potential_ast','ast','ast_conversion'];
  if(stat==='reb')return ['minutes','rebound_chances','reb','reb_conversion'];
  if(stat==='pts+reb+ast')return ['minutes','pts','reb','ast'];
  if(stat==='pts+reb')return ['minutes','pts','reb','pr'];
  if(stat==='pts+ast')return ['minutes','pts','ast','pa'];
  if(stat==='reb+ast')return ['minutes','reb','ast','ra'];
  if(['stl','blk','stl_blk'].includes(stat))return ['minutes','stl','blk','stl_blk'];
  if(['tov','pf','usage_pct','touches'].includes(stat))return ['minutes',stat,...['usage_pct','touches','pts'].filter(key=>key!==stat).slice(0,2)];
  return ['minutes','fga','fta','pts'];
}
export function evidenceRows(rows:EvidenceRow[]):EvidenceRow[] {
  const seen=new Set<string>();
  return rows.map((row,index)=>({row,index})).filter(({row})=>{
    const raw=String(row.game_id??row.game_key??'').trim(),key=/^\d+$/.test(raw)?raw.replace(/^0+/,'')||'0':raw;
    if(!key)return true;if(seen.has(key))return false;seen.add(key);return true;
  }).sort((a,b)=>getDateSortValue(a.row.game_date)-getDateSortValue(b.row.game_date)||a.index-b.index).map(item=>item.row);
}
export function evidenceValue(row:EvidenceRow,id:string,scope:PeriodScope='FULL'):number|null {
  if(id==='minutes'){
    if(scope!=='FULL'&&periodCode(row.period_scope??row.split_code)!==scope)return null;
    return getMinutesValue(row);
  }
  if(scope==='FULL'&&row.split_code&&periodCode(row.split_code)!=='FULL')return null;
  const direct=finiteStat(periodMetricValue(row,id,scope));
  if(direct!==null)return direct;
  const combos:Record<string,string>={pr:'pts+reb',pa:'pts+ast',ra:'reb+ast',stl_blk:'stl+blk'};
  return combos[id]?finiteStat(periodMetricValue(row,combos[id],scope)):null;
}
export function evidenceReading(row:EvidenceRow,metric:EvidenceMetric,scope:PeriodScope='FULL'){
  if(metric.numerator&&metric.denominator){
    const made=evidenceValue(row,metric.numerator,scope),attempts=evidenceValue(row,metric.denominator,scope);
    const invalid=made!==null&&attempts!==null&&made>attempts;
    return {value:invalid||made===null||attempts===null||attempts===0?null:made/attempts*100,invalid,zero:made===0&&attempts===0,made,attempts};
  }
  const value=evidenceValue(row,metric.id,scope);
  const actual=({potential_ast:'ast',rebound_chances:'reb',fga:'fgm',fg3a:'fg3m',fta:'ftm'} as Record<string,string>)[metric.id]??null;
  const produced=actual?evidenceValue(row,actual,scope):null;
  const invalid=value!==null&&produced!==null&&value<produced;
  return {value:invalid?null:value,invalid,zero:false,made:null,attempts:null};
}
export function summarizeEvidence(rows:EvidenceRow[],metric:EvidenceMetric,scope:PeriodScope='FULL'){
  const ordered=evidenceRows(rows),items=ordered.map(row=>evidenceReading(row,metric,scope));
  const valid=items.filter(item=>item.value!==null),values=valid.map(item=>item.value!);
  const ratio=Boolean(metric.numerator&&metric.denominator);
  const numerator=ratio?valid.reduce((sum,item)=>sum+item.made!,0):null;
  const denominator=ratio?valid.reduce((sum,item)=>sum+item.attempts!,0):null;
  const average=values.length?(ratio?numerator!/denominator!*100:values.reduce((sum,value)=>sum+value,0)/values.length):null;
  const latest=items.at(-1)?.value??null;
  return {metric,average,latest,maximum:ratio?100:values.length?Math.max(...values):null,
    count:values.length,total:ordered.length,invalid:items.filter(item=>item.invalid).length,
    zeroOpportunities:items.filter(item=>item.zero).length,numerator,denominator,
    latestDate:ordered.at(-1)?.game_date??null,coverage:ordered.length?values.length/ordered.length*100:null};
}
export function evidenceMissingText(summary:ReturnType<typeof summarizeEvidence>,scope:PeriodScope='FULL'){
  if(!summary.total)return 'Sin partidos en la muestra.';
  if(summary.count)return summary.invalid?`${summary.invalid} registro(s) inconsistente(s) excluido(s).`:'';
  if(summary.invalid)return 'Datos inconsistentes: no se calcula con esos registros.';
  if(summary.zeroOpportunities)return 'Sin oportunidades registradas para calcular la conversión.';
  if(summary.metric.id==='minutes'&&scope!=='FULL')return 'Sin minutos comprobados de este período.';
  if(scope!=='FULL')return summary.metric.tracking?'Sin tracking de este período en la muestra.':'Sin datos de esta métrica para el período.';
  return summary.metric.tracking?'Sin tracking disponible en la muestra.':'Sin datos de esta métrica en la muestra.';
}
export function contextEvidence(games:EvidenceRow[],shots:EvidenceRow[],matchups:EvidenceRow[]){
  const key=(row:EvidenceRow)=>{const raw=String(row.game_id??row.id??'').trim();return /^\d+$/.test(raw)?raw.replace(/^0+/,'')||'0':raw;};
  const selected=new Set(games.map(key).filter(Boolean));
  const covered=(rows:EvidenceRow[])=>new Set(rows.map(key).filter(id=>selected.has(id))).size;
  return {total:selected.size,shots:covered(shots),matchups:covered(matchups)};
}
export function contextEmptyText(kind:'shots'|'matchups',coverage:ReturnType<typeof contextEvidence>){
  if(!coverage.total)return 'No hay partidos seleccionados con estos filtros.';
  return `${coverage.total} partido(s) seleccionado(s) · ${coverage[kind]} con ${kind==='shots'?'tiros':'asignaciones defensivas'} disponibles.`;
}
