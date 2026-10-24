export const MARKETS = { PTS:'Puntos', REB:'Rebotes', AST:'Asistencias', PRA:'Puntos + rebotes + asistencias', PR:'Puntos + rebotes', PA:'Puntos + asistencias', RA:'Rebotes + asistencias', '3PT':'Triples anotados', '3PA':'Triples intentados', FTM:'Tiros libres anotados', FTA:'Tiros libres intentados', FGM:'Tiros de campo anotados', FGA:'Tiros de campo intentados', STL:'Robos', BLK:'Tapones', TO:'Pérdidas', 'STL+BLK':'Robos + tapones' } as const;
export type Market = keyof typeof MARKETS;
export type Book = 'stake'|'betano'|'bet365'|'unknown';
export type Scope = 'FULL'|'Q1'|'H1'|'H2_REG';
export type Operator = 'over'|'under'|'at_least'|'at_most';
export const SCOPES:Record<Scope,string> = {FULL:'Partido completo',Q1:'Primer cuarto',H1:'Primera mitad',H2_REG:'Segunda mitad (sin prórroga)'};
export const OPERATORS:Record<Operator,string> = {over:'Más de',under:'Menos de',at_least:'Al menos',at_most:'Como máximo'};
export const TEAMS = ['ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK','OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WAS'];
export const PARSE_ISSUES=['NAME_MISSING','NAME_AMBIGUOUS','MARKET_MISSING','MARKET_AMBIGUOUS','EVENT_FROM_FOOTER','EVENT_MISSING'] as const;
export type Leg = { id:string; book:Book; group:string; playerName:string; playerId?:number; matchup:string; teams:string[]; playerTeam?:string; teamConfirmed?:boolean; teamSource?:'ticket'|'schedule'|'manual'; parseIssues?:string[]; market:Market|null; operator:Operator|null; line:number|null; scope:Scope; odds:number|null; groupOdds:number|null; eventDate:string; raw:string; confirmed:boolean };
export type TicketDocument = {version:1; title:string; eventDate:string; totalOdds:number|null; legs:Leg[]; warnings:string[]};
export type PlayerOption = {id:number;name:string;team:string|null};
export type TeamContext = {status:'matched'|'conflict'|'ambiguous'|'not_found'|'unavailable'|'not_checked';team:string|null;teams:string[];gameId:string|null;referenceAt:string;referenceSource:'roster'|'recent_archive'|'manual';message:string};
export type IdentityReview = {status:'exact'|'suggested'|'ambiguous'|'not_found'|'invalid';originalName:string;player?:PlayerOption;candidates:PlayerOption[];message:string;teamContext?:TeamContext};
export type Game = {id:string;date:string;season:string;phase:string;opponent:string|null;team:string|null;minutes:number|null;value:number|null};
export type Settings = {eventDate:string; phase:'ALL'|'Regular Season'|'Playoffs'; seasons:'last2'|'current'|'all'; minMinutes:number|null};
export type QuoteDiagnostic = {reason:string;counts?:{player:number;date:number;event:number;market:number;scope:number;line:number;timed:number};publication?:{available:boolean;bookRows:number;dateRows:number;undatedRows:number;latestCapturedAt:string|null}};
export type QuoteInfo = {status:'matched'|'not_found'|'unavailable'|'inactive'|'conflict';message:string;price?:number;book?:Book;capturedAt?:string;eventDate?:string;line?:number;side?:string;diagnostic?:QuoteDiagnostic};
export type Result = {player:PlayerOption; games:Game[]; warnings:string[]; asOf:string; source:string; archiveId:string; quote:QuoteInfo; coverage:'ready'|'no_history'|'filtered_out'|'missing_period';teamContext?:TeamContext};
export type ConnectionInfo = {archive:{ok:true;id:string;facts:number;sampleRows:number};periods:{ok:boolean;hasRows:boolean};quotes:{ok:boolean;hasRows:boolean}};
export function normalize(value:unknown){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
export function decimal(raw:unknown):number|null {
 if(typeof raw==='number')return Number.isFinite(raw)?raw:null;
 const s=String(raw??'').trim();if(!/^\d+(?:[.,]\d+)?$/.test(s))return null;
 const n=Number(s.replace(',','.'));return Number.isFinite(n)?n:null;
}
export function isDate(value:unknown):value is string {return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function argentinaDate(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(x=>x.type===k)!.value).join('-');}
export function emptyLeg(date:string,book:Book='unknown'):Leg{return {id:globalThis.crypto.randomUUID(),book,group:'1',playerName:'',matchup:'',teams:[],market:'PTS',operator:'over',line:null,scope:'FULL',odds:null,groupOdds:null,eventDate:date,raw:'',confirmed:false};}
