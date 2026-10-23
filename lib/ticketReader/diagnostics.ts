import 'server-only';
import {createHash} from 'node:crypto';
import prisma from '@/lib/prisma';
import {readSession} from '@/lib/auth/service.mjs';
import {COOKIE_NAME} from '@/lib/auth/server';
import type {NextRequest} from 'next/server';
import {REPORT_DAYS,REPORT_LIMIT,sanitizeReport,type ReaderReport} from './diagnosticModel';

let ready:Promise<void>|undefined,lastFailure=0;
const lock='SELECT 1 FROM pg_advisory_xact_lock(52417835)';
async function ensureStore(){
 if(!ready){if(Date.now()-lastFailure<30000)throw Error('STORE_UNAVAILABLE');
  ready=prisma.$transaction(async tx=>{
   await tx.$queryRawUnsafe(lock);
   await tx.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS ticket_reader_private');
   await tx.$executeRawUnsafe('REVOKE ALL ON SCHEMA ticket_reader_private FROM PUBLIC');
   await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ticket_reader_private.reports (id uuid PRIMARY KEY, trace_id uuid NOT NULL, actor_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), event jsonb NOT NULL CHECK (octet_length(event::text) <= 4096))`);
   await tx.$executeRawUnsafe('ALTER TABLE ticket_reader_private.reports ENABLE ROW LEVEL SECURITY');
   await tx.$executeRawUnsafe('REVOKE ALL ON ticket_reader_private.reports FROM PUBLIC');
   await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS ticket_reader_reports_created_idx ON ticket_reader_private.reports (created_at DESC)');
  },{maxWait:1000,timeout:4000}).then(()=>{}).catch(error=>{ready=undefined;lastFailure=Date.now();throw error;});
 }
 await ready;
}
export async function saveReport(request:NextRequest,value:ReaderReport):Promise<boolean>{
 try{
  const event=sanitizeReport(value);if(!event)return false;
  const user=await readSession(prisma,request.cookies.get(COOKIE_NAME)?.value);if(!user)return false;
  const actor=createHash('sha256').update(String(user.id)).digest('hex');await ensureStore();
  return await prisma.$transaction(async tx=>{
   await tx.$queryRawUnsafe(lock);
   await tx.$executeRawUnsafe(`DELETE FROM ticket_reader_private.reports WHERE created_at < now() - interval '14 days'`);
   const old=await tx.$queryRawUnsafe<{actor_hash:string}[]>('SELECT actor_hash FROM ticket_reader_private.reports WHERE id=$1::uuid',event.id);
   if(old.length)return old[0].actor_hash===actor;
   const count=await tx.$queryRawUnsafe<{n:bigint}[]>(`SELECT count(*) AS n FROM ticket_reader_private.reports WHERE actor_hash=$1 AND created_at >= now() - interval '1 day'`,actor);
   if(Number(count[0]?.n)>=200)return false;
   await tx.$executeRawUnsafe('INSERT INTO ticket_reader_private.reports (id,trace_id,actor_hash,event) VALUES ($1::uuid,$2::uuid,$3,$4::jsonb)',event.id,event.traceId,actor,JSON.stringify(event));
   await tx.$executeRawUnsafe('DELETE FROM ticket_reader_private.reports WHERE id IN (SELECT id FROM ticket_reader_private.reports ORDER BY created_at DESC,id DESC OFFSET 1000)');
   return true;
  },{maxWait:1000,timeout:3000});
 }catch{return false;}
}
export async function reportExport(){
 await ensureStore();
 const rows=await prisma.$queryRawUnsafe<{created_at:Date;actor_hash:string;event:unknown}[]>(`SELECT created_at,actor_hash,event FROM ticket_reader_private.reports WHERE created_at >= now() - interval '14 days' ORDER BY created_at DESC,id DESC LIMIT 1000`);
 const reports=rows.flatMap(row=>{const event=sanitizeReport(typeof row.event==='string'?JSON.parse(row.event):row.event);return event?[{...event,receivedAt:new Date(row.created_at).toISOString(),tester:row.actor_hash.slice(0,12)}]:[]});
 return {version:5,exportedAt:new Date().toISOString(),retention:{days:REPORT_DAYS,maxReports:REPORT_LIMIT},counts:{total:reports.length,ok:reports.filter(r=>r.outcome==='ok').length,review:reports.filter(r=>r.outcome==='review').length,error:reports.filter(r=>r.outcome==='error').length},reports};
}
