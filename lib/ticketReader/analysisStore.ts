import 'server-only';
import {createHash} from 'node:crypto';
import type {NextRequest} from 'next/server';
import prisma from '@/lib/prisma';
import {readSession} from '@/lib/auth/service.mjs';
import {COOKIE_NAME} from '@/lib/auth/server';
import {ANALYSIS_DAYS, ANALYSIS_LIMIT, ANALYSIS_TOTAL_BYTES, sanitizeAnalysis, type AnalysisSnapshot} from './analysisSnapshot';

let ready:Promise<void>|undefined,lastFailure=0;
async function ensureStore(){
 if(!ready){
  if(Date.now()-lastFailure<30000)throw Error('STORE_UNAVAILABLE');
  ready=prisma.$transaction(async tx=>{
   // Serialize schema creation with the existing diagnostic store.
   await tx.$queryRawUnsafe('SELECT 1 FROM pg_advisory_xact_lock(52417835)');
   await tx.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS ticket_reader_private');
   await tx.$executeRawUnsafe('REVOKE ALL ON SCHEMA ticket_reader_private FROM PUBLIC');
   await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ticket_reader_private.analyses (id uuid PRIMARY KEY, trace_id uuid NOT NULL, actor_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), snapshot jsonb NOT NULL CHECK (octet_length(snapshot::text) <= 262144))`);
   await tx.$executeRawUnsafe('ALTER TABLE ticket_reader_private.analyses ENABLE ROW LEVEL SECURITY');
   await tx.$executeRawUnsafe('REVOKE ALL ON ticket_reader_private.analyses FROM PUBLIC');
   await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS ticket_reader_analyses_created_idx ON ticket_reader_private.analyses (created_at DESC)');
  },{maxWait:1000,timeout:5000}).then(()=>{}).catch(error=>{ready=undefined;lastFailure=Date.now();throw error;});
 }
 await ready;
}
export async function saveAnalysis(request:NextRequest,value:AnalysisSnapshot):Promise<boolean>{
 try{
  const snapshot=sanitizeAnalysis(value);if(!snapshot)return false;
  const user=await readSession(prisma,request.cookies.get(COOKIE_NAME)?.value);if(!user)return false;
  const actor=createHash('sha256').update(String(user.id)).digest('hex');await ensureStore();
  return await prisma.$transaction(async tx=>{
   await tx.$queryRawUnsafe('SELECT 1 FROM pg_advisory_xact_lock(52417836)');
   await tx.$executeRawUnsafe(`DELETE FROM ticket_reader_private.analyses WHERE created_at < now() - interval '14 days' OR (snapshot->>'startedAt')::timestamptz < now() - interval '14 days'`);
   const old=await tx.$queryRawUnsafe<{actor_hash:string}[]>('SELECT actor_hash FROM ticket_reader_private.analyses WHERE id=$1::uuid',snapshot.id);
   if(old.length)return old[0].actor_hash===actor;
   const count=await tx.$queryRawUnsafe<{n:bigint}[]>(`SELECT count(*) AS n FROM ticket_reader_private.analyses WHERE actor_hash=$1 AND created_at >= now() - interval '1 day'`,actor);
   if(Number(count[0]?.n)>=20)return false;
   await tx.$executeRawUnsafe('INSERT INTO ticket_reader_private.analyses (id,trace_id,actor_hash,snapshot) VALUES ($1::uuid,$2::uuid,$3,$4::jsonb)',snapshot.id,snapshot.traceId,actor,JSON.stringify(snapshot));
   await tx.$executeRawUnsafe('DELETE FROM ticket_reader_private.analyses WHERE id IN (SELECT id FROM ticket_reader_private.analyses ORDER BY created_at DESC,id DESC OFFSET 100)');
   await tx.$executeRawUnsafe('DELETE FROM ticket_reader_private.analyses WHERE id IN (SELECT id FROM (SELECT id,sum(octet_length(snapshot::text)) OVER (ORDER BY created_at DESC,id DESC) AS bytes FROM ticket_reader_private.analyses) recent WHERE bytes > $1::bigint)',ANALYSIS_TOTAL_BYTES);
   return true;
  },{maxWait:1000,timeout:4000});
 }catch{return false;}
}
export async function analysisExport(){
 await ensureStore();
 const rows=await prisma.$queryRawUnsafe<{created_at:Date;actor_hash:string;snapshot:unknown}[]>(`SELECT created_at,actor_hash,snapshot FROM ticket_reader_private.analyses WHERE created_at >= now() - interval '14 days' ORDER BY created_at DESC,id DESC LIMIT 100`);
 const analyses=rows.flatMap(row=>{const snapshot=sanitizeAnalysis(typeof row.snapshot==='string'?JSON.parse(row.snapshot):row.snapshot);return snapshot?[{...snapshot,receivedAt:new Date(row.created_at).toISOString(),tester:row.actor_hash.slice(0,12)}]:[];});
 return {schema:'nba-ticket-analysis-export',version:1,exportedAt:new Date().toISOString(),retention:{days:ANALYSIS_DAYS,maxAnalyses:ANALYSIS_LIMIT,maxStoredBytes:ANALYSIS_TOTAL_BYTES},counts:{total:analyses.length,complete:analyses.filter(r=>r.status==='complete').length,partial:analyses.filter(r=>r.status==='partial').length,review:analyses.filter(r=>r.status==='review').length,error:analyses.filter(r=>r.status==='error').length},analyses};
}
