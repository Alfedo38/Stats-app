import {importTicket} from './parser';
import {isDate,type TicketDocument,type Leg} from './model';
import {safePlayerHref,mergeSelection} from '../playerNavigation';
export type Draft={version:1;revision:string;at:number;document:TicketDocument;returnTo:string|null};
export const DRAFT_BYTES=500000,DRAFT_DAYS=14;
export type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function cleanDraftDocument(value:unknown):TicketDocument {
 const d=importTicket(value),raw=value as TicketDocument;
 const used=new Set<string>();
 return {...d,warnings:d.warnings.filter(w=>w.startsWith('Mercado sin análisis:')||w.startsWith('El ticket incluye un mercado de ganador')),legs:d.legs.map((l,i)=>{
  let id=String(raw.legs[i]?.id??'');if(!/^[a-zA-Z0-9-]{1,100}$/.test(id)||used.has(id))id=`draft-${i+1}`;while(used.has(id))id+='-x';used.add(id);
  return {id,book:l.book,group:l.group,playerName:l.playerName,playerId:l.playerId,matchup:l.teams.join(' – '),teams:l.teams,playerTeam:l.playerTeam,teamConfirmed:false,teamSource:l.teamSource,market:l.market,operator:l.operator,line:l.line,scope:l.scope,odds:l.odds,groupOdds:l.groupOdds,eventDate:l.eventDate,raw:'',confirmed:false,origin:l.origin,pageSample:l.pageSample,quoteCapturedAt:l.quoteCapturedAt};
 })};
}
export function draftKey(userKey:string){if(!userKey||userKey.length>180)throw Error('DRAFT_INVALID');return userKey+':draft-v1';}
export function readDraft(storage:StorageLike,userKey:string,now=Date.now()):Draft|null {
 const raw=storage.getItem(draftKey(userKey));if(!raw)return null;if(raw.length>DRAFT_BYTES)throw Error('DRAFT_INVALID');
 const x=JSON.parse(raw);if(x?.version!==1||typeof x.revision!=='string'||!/^[a-f0-9-]{36}$/i.test(x.revision)||!Number.isFinite(x.at))throw Error('DRAFT_INVALID');
 if(now-x.at>DRAFT_DAYS*86400000||x.at>now+300000)return null;
 return {version:1,revision:x.revision,at:x.at,document:cleanDraftDocument(x.document),returnTo:safePlayerHref(x.returnTo)};
}
export function saveDraft(storage:StorageLike,userKey:string,doc:TicketDocument,revision:string|null,returnTo:string|null,now=Date.now()):Draft {
 const old=readDraft(storage,userKey,now);if((old?.revision??null)!==revision)throw Error('DRAFT_CONFLICT');
 const document=cleanDraftDocument(doc),href=safePlayerHref(returnTo);if(old&&JSON.stringify(document)===JSON.stringify(old.document)&&href===old.returnTo)return old;
 const result:Draft={version:1,revision:crypto.randomUUID(),at:now,document,returnTo:href};const encoded=JSON.stringify(result);if(encoded.length>DRAFT_BYTES)throw Error('DRAFT_FULL');storage.setItem(draftKey(userKey),encoded);return result;
}
export function appendDraft(storage:StorageLike,userKey:string,leg:Leg,returnTo:string|null,now=Date.now()){
 const previous=readDraft(storage,userKey,now),blank:TicketDocument={version:1,title:'Mi ticket NBA',eventDate:leg.eventDate,totalOdds:null,legs:[],warnings:[]};
 const merged=mergeSelection(previous?.document??blank,leg);return {draft:saveDraft(storage,userKey,merged.document,previous?.revision??null,returnTo,now),duplicate:merged.duplicate};
}
export function exportDraftDocument(doc:TicketDocument){return JSON.stringify(cleanDraftDocument(doc),null,2);}
export function blankDraft(date:string):TicketDocument{if(!isDate(date))throw Error('DRAFT_INVALID');return {version:1,title:'Mi ticket NBA',eventDate:date,totalOdds:null,legs:[],warnings:[]};}
