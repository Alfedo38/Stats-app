import type {QuoteDiagnostic} from './model';
export const QUOTE_REASONS=['MATCHED','BOOK_REQUIRED','INVALID_MARKET','BOOK_EMPTY','DATE_NOT_PUBLISHED','PLAYER_NOT_FOUND','DATE_MISMATCH','EVENT_MISMATCH','MARKET_MISMATCH','SCOPE_MISMATCH','LINE_MISMATCH','CAPTURE_TIME_INVALID','INACTIVE','CONFLICT','SOURCE_UNAVAILABLE','CANDIDATE_LIMIT','LEGACY_UNKNOWN','NOT_QUERIED'] as const;
export function sanitizeQuoteDiagnostic(value:unknown):QuoteDiagnostic {
 const d=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const reason=typeof d.reason==='string'&&(QUOTE_REASONS as readonly string[]).includes(d.reason)?d.reason:'LEGACY_UNKNOWN';
 const result:QuoteDiagnostic={reason};
 const count=(n:unknown)=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<=10_000_000;
 if(d.counts&&typeof d.counts==='object'){
  const c=d.counts as Record<string,unknown>,keys=['player','date','event','market','scope','line','timed'] as const;
  if(keys.every(k=>count(c[k])))result.counts=Object.fromEntries(keys.map(k=>[k,c[k]])) as QuoteDiagnostic['counts'];
 }
 if(d.publication&&typeof d.publication==='object'){
  const p=d.publication as Record<string,unknown>;
  if(typeof p.available==='boolean'&&['bookRows','dateRows','undatedRows'].every(k=>count(p[k]))){
   const at=typeof p.latestCapturedAt==='string'&&Number.isFinite(Date.parse(p.latestCapturedAt))?new Date(p.latestCapturedAt).toISOString():null;
   result.publication={available:p.available,bookRows:p.bookRows as number,dateRows:p.dateRows as number,undatedRows:p.undatedRows as number,latestCapturedAt:at};
  }
 }
 return result;
}
