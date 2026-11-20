import {EVIDENCE_METRICS,evidenceReading} from './marketEvidence';
import {finiteStat,selectionSummary} from './selectionStats';
import {buildPeriodRows,periodMetricValue,type PeriodScope} from './nbaPeriodStats';
import {getMinutesValue} from './formatters';
import {gamePhase} from './nbaGameFilters';
import {historySeasons} from './nbaHistoryWindow';
import {canonicalOddsPlayerName} from './oddsPlayerNames';
import {normalizedEvent,oddsMarket,oddsScope,oddsBook,type PriceQuote} from './nbaOdds';

export const STUDIO_MARKETS={pts:'Puntos',reb:'Rebotes',ast:'Asistencias',pra:'Puntos + rebotes + asistencias',pr:'Puntos + rebotes',pa:'Puntos + asistencias',ra:'Rebotes + asistencias',fg3m:'Triples anotados (3PM)',fg3a:'Triples intentados (3PA)',fg2m:'Dobles anotados (2PM)',fg2a:'Dobles intentados (2PA)',fgm:'Tiros de campo anotados',fga:'Tiros de campo intentados',ftm:'Tiros libres anotados',fta:'Tiros libres intentados',oreb:'Rebotes ofensivos',dreb:'Rebotes defensivos',stl:'Robos',blk:'Tapones',stl_blk:'Robos + tapones',tov:'Pérdidas',pf:'Faltas',potential_ast:'Asistencias potenciales',rebound_chances:'Chances de rebote',minutes:'Minutos'} as const;
export type StudioMarket=keyof typeof STUDIO_MARKETS;
export type StudioRow=Record<string,unknown>;
export type StudioSide='over'|'under';
export type StudioRange='5'|'10'|'20'|'50'|'season'|'previous'|'rival';
export const STUDIO_SCOPES:Record<PeriodScope,string>={FULL:'Partido',Q1:'1.º cuarto',H1:'1.ª mitad',H2_REG:'2.ª mitad'};
export const STUDIO_BOOKS=[{id:'bet365',label:'365'},{id:'betano',label:'Bto'},{id:'stake',label:'Ste'}] as const;
export function studioMarket(raw:unknown):StudioMarket{return typeof raw==='string'&&Object.hasOwn(STUDIO_MARKETS,raw)?raw as StudioMarket:'pts';}
export function studioNumber(raw:unknown,digits=1){const n=finiteStat(raw);return n===null?'S/D':n.toLocaleString('es-AR',{maximumFractionDigits:digits});}
export function studioDate(raw:unknown){const date=String(raw??'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(date)?date.split('-').reverse().join('/'):'Fecha S/D';}
export function studioId(row:StudioRow){const raw=String(row.game_id??'');return /^\d{1,15}$/.test(raw)?String(Number(raw)):'';}
export function studioOpponent(row:StudioRow){const explicit=String(row.opponent_clean??row.opponent_abbr??row.opponent??'').toUpperCase();return /^[A-Z]{3}$/.test(explicit)?explicit:String(row.matchup??'').toUpperCase().match(/(?:@|VS\.?)\s*([A-Z]{3})\b/)?.[1]??'';}
export function studioVenue(row:StudioRow){const value=String(row.home_away??row.home_away_clean??'').toUpperCase();return ['HOME','H'].includes(value)?'HOME':['AWAY','A'].includes(value)?'AWAY':String(row.matchup??'').includes('@')?'AWAY':/\bVS\.?\s/i.test(String(row.matchup??''))?'HOME':null;}
export function studioSeason(date:string){return historySeasons(date)[0];}
export function studioValue(row:StudioRow,market:StudioMarket,scope:PeriodScope='FULL'):number|null{
 if(['potential_ast','rebound_chances'].includes(market))return evidenceReading(row,EVIDENCE_METRICS[market],scope).value;
 if(market==='minutes')return scope==='FULL'||row.period_minutes_verified===true&&row.minutes_scope===scope?getMinutesValue(row):null;
 const combinations:Record<string,string[]>={pra:['pts','reb','ast'],pr:['pts','reb'],pa:['pts','ast'],ra:['reb','ast'],stl_blk:['stl','blk']};
 const fields=combinations[market];
 if(fields){const values=fields.map(f=>finiteStat(periodMetricValue(row,f,scope)));return values.some(v=>v===null)?null:values.reduce<number>((s,v)=>s+v!,0);}
 return finiteStat(periodMetricValue(row,market,scope));
}
export function studioBaseRows(raw:StudioRow[],date:string){
 const unique=new Map<string,StudioRow>(),seasons=historySeasons(date);
 for(const row of [...raw].sort((a,b)=>String(b.game_date??'').localeCompare(String(a.game_date??'')))){
  const day=String(row.game_date??'').slice(0,10),id=studioId(row),phase=gamePhase(row);
  if(!id||unique.has(id)||!/^\d{4}-\d{2}-\d{2}$/.test(day)||day>=date||!seasons.includes(studioSeason(day))||!['Regular Season','Playoffs'].includes(phase??'')||getMinutesValue(row)===0)continue;
  unique.set(id,row);
 }
 return [...unique.values()];
}
export function studioSample(raw:StudioRow[],splits:StudioRow[],options:{date:string;market:StudioMarket;scope:PeriodScope;range:string;phase?:string;opponent:string;venue?:string;minMinutes?:number|null}){
 const season=studioSeason(options.date),previous=historySeasons(options.date)[1];
 let full=studioBaseRows(raw,options.date).filter(row=>(!options.phase||options.phase==='ALL'||gamePhase(row)===options.phase)&&(!options.venue||studioVenue(row)===options.venue)&&(options.minMinutes==null||getMinutesValue(row)!==null&&getMinutesValue(row)!>=options.minMinutes));
 if(options.range==='rival')full=options.opponent?full.filter(row=>studioOpponent(row)===options.opponent):[];
 if(options.range==='season'||options.range==='previous')full=full.filter(row=>studioSeason(String(row.game_date))===(options.range==='season'?season:previous));
 if(['5','10','20','50'].includes(options.range))full=full.slice(0,Number(options.range));
 // Preserve the full-game sample, including a missing partial or tracking value.
 // Do not replace missing periods with full-game values or silently backfill older games.
 const scopeMarket=options.market==='minutes'?'pts':options.market;
 const partial=options.scope==='FULL'?[]:buildPeriodRows(full,splits,options.scope,scopeMarket);
 const byId=new Map(partial.map(row=>[studioId(row),row]));
 return full.map(row=>options.scope==='FULL'?row:byId.get(studioId(row))??{game_id:row.game_id,game_date:row.game_date,season_type:row.season_type,opponent:studioOpponent(row),team_abbreviation:row.team_abbreviation,split_code:options.scope,period_scope:options.scope,minutes:null});
}
export function studioLine(values:unknown[]):number|null{const average=selectionSummary(values.slice(0,10),NaN,'over').average;return average===null?null:Math.min(299.5,Math.floor(average)+.5);}
export function validStudioLine(value:unknown):value is number{return typeof value==='number'&&Number.isFinite(value)&&value>=.5&&value<=299.5&&Number.isInteger(value-.5);}
export function studioQuote(quotes:PriceQuote[],input:{name:string;market:string;scope:PeriodScope;teams:string[];date:string;line:number;side:StudioSide;book:string},now=new Date()){
 if(input.teams.length!==2||input.teams[0]===input.teams[1])return null;
 const event=[...input.teams].sort().join('-'),market=oddsMarket(input.market);if(!market)return null;
 const field=input.side==='over'?'over_price':'under_price';
 const matching=quotes.filter(q=>canonicalOddsPlayerName(q.player_name)===canonicalOddsPlayerName(input.name)&&oddsBook(q.book)===input.book&&oddsMarket(q.prop_type)===market&&oddsScope(q.scope)===input.scope&&q.line===input.line&&String(q.event_date??'').slice(0,10)===input.date&&normalizedEvent(q.matchup)===event)
  .map(q=>({price:finiteStat(q[field]),at:q[input.side==='over'?'overCapturedAt':'underCapturedAt']??q.updated_at})).filter(q=>q.at&&Number.isFinite(Date.parse(q.at))&&Date.parse(q.at)<=now.getTime()).sort((a,b)=>Date.parse(b.at!)-Date.parse(a.at!));
 const latest=matching[0];if(!latest||latest.price===null||latest.price<=1||matching.some(q=>q.at===latest.at&&q.price!==latest.price))return null;
 return {price:latest.price,at:latest.at!};
}
export function studioStreak(values:unknown[],line:number,side:StudioSide){let result=0;for(const value of values){const s=selectionSummary([value],line,side);if(s.hits!==1)break;result++;}return result;}
export function studioExplain(values:unknown[],line:number|null,side:StudioSide){
 if(line===null)return 'No hay una línea para evaluar.';
 const s=selectionSummary(values,line,side);if(!s.valid)return 'Sin muestra para evaluar esta selección.';
 return `${s.hits} de ${s.decided} partidos con resultado ${side==='over'?'superaron':'quedaron por debajo de'} ${studioNumber(line)}. Promedio: ${studioNumber(s.average)}.${s.missing?` Faltan datos en ${s.missing} de ${s.total} partidos.`:''} Es un antecedente histórico, no una probabilidad del próximo partido.`;
}
