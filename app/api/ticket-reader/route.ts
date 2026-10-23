import {NextResponse,type NextRequest} from 'next/server';
import {withAuth,readBody} from '@/lib/auth/server';
import {findPlayers,readAnalysis,readerConnection,resolveNames} from '@/lib/ticketReader/data';
import {apiReport} from '@/lib/ticketReader/diagnosticModel';
import {saveReport} from '@/lib/ticketReader/diagnostics';
import {ReaderError} from '@/lib/ticketReader/errors';
import {importTicket} from '@/lib/ticketReader/parser';
import {isDate,TEAMS,type Settings} from '@/lib/ticketReader/model';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export const POST=withAuth(async(req:NextRequest)=>{
 let body:Record<string,unknown>={};
 const respond=async(value:Record<string,unknown>,options:{status?:number}={})=>{const event=apiReport(body,value),saved=await saveReport(req,event);return NextResponse.json({...value,diagnostic:{saved,event}},options);};
 try{body=await readBody(req);}catch{return respond({ok:false,code:'INPUT_INVALID',error:'Solicitud inválida o demasiado grande.'},{status:400});}
 try{
  if(body.action==='health')return respond({ok:true,connection:await readerConnection()});
  const validTeams=(value:unknown):value is string[]=>Array.isArray(value)&&value.length<=2&&value.every(t=>typeof t==='string'&&TEAMS.includes(t));
  if(body.action==='resolve'){
   if(!Array.isArray(body.items)||body.items.length<1||body.items.length>8)throw Error('INPUT');
   const items=body.items.map(value=>{
    if(!value||typeof value!=='object')throw Error('INPUT');
    const x=value as Record<string,unknown>;
    if(typeof x.id!=='string'||!x.id.length||x.id.length>100||typeof x.name!=='string'||x.name.length>100||!validTeams(x.teams))throw Error('INPUT');
    return {id:x.id,name:x.name,teams:x.teams};
   });
   if(new Set(items.map(x=>x.id)).size!==items.length)throw Error('INPUT');
   return respond({ok:true,reviews:await resolveNames(items)});
  }
  if(body.action==='players'){
   if(typeof body.name!=='string'||body.name.trim().length<2||body.name.length>100)return respond({ok:false,error:'Escribí al menos dos letras.'},{status:400});
   if(body.teams!==undefined&&!validTeams(body.teams))throw Error('INPUT');
   return respond({ok:true,candidates:await findPlayers(body.name,body.teams as string[]|undefined)});
  }
  if(body.action!=='analyze'||!body.leg||!body.settings||typeof body.settings!=='object')throw Error('INPUT');
  const s=body.settings as Settings;
  if(!isDate(s.eventDate)||!['ALL','Regular Season','Playoffs'].includes(s.phase)||!['last2','current','all'].includes(s.seasons)||s.minMinutes!==null&&(typeof s.minMinutes!=='number'||!Number.isFinite(s.minMinutes)||s.minMinutes<0||s.minMinutes>60))throw Error('INPUT');
  let leg;try{leg=importTicket({version:1,eventDate:s.eventDate,legs:[body.leg]}).legs[0];}catch{throw Error('INPUT');}
  if((body.leg as {confirmed?:boolean}).confirmed!==true||!leg.market||!leg.operator||leg.line===null||leg.teams.length!==2||leg.teams[0]===leg.teams[1]||leg.playerName.trim().length<3)throw Error('INPUT');
  return respond(await readAnalysis(leg,s));
 }catch(error){
  if(error instanceof ReaderError)return respond({ok:false,error:error.message,code:error.code},{status:error.status});
  if(error instanceof Error&&error.message==='INPUT')return respond({ok:false,code:'INPUT_INVALID',error:'Confirmá jugador, equipos, mercado, línea y período.'},{status:400});
  // Connection details and screenshot text never appear in logs or error responses.
  return respond({ok:false,error:'No se pudo consultar el histórico verificado. Reintentá; los datos faltantes no se reemplazan con ceros.'},{status:503});
 }
});
