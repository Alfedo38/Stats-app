import {requirePageUser} from '@/lib/auth/server';
import {argDate,jornadaDateAllowed} from '@/lib/nbaJornada';
import NbaWorkspace from './NbaWorkspace';
import {studioMarket,validStudioLine} from '@/lib/nbaStudio';
import type {StudioSelection} from './NbaWorkspace';
export const dynamic='force-dynamic';
export const metadata={title:'NBA · Mesa de análisis'};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const user=await requirePageUser(),q=await searchParams;
 const scope=['FULL','Q1','H1','H2_REG'].includes(String(q.scope))?q.scope as StudioSelection['scope']:'FULL';
 const initialSelection:StudioSelection={market:studioMarket(q.market),scope,range:['5','10','20','50','season','previous','rival'].includes(String(q.range))?String(q.range):'10',side:q.side==='under'?'under':'over',line:validStudioLine(Number(q.line))?Number(q.line):null,phase:['Regular Season','Playoffs'].includes(String(q.phase))?String(q.phase):'ALL',venue:['HOME','AWAY'].includes(String(q.venue))?String(q.venue):'ALL',minMinutes:typeof q.minMinutes==='string'&&Number(q.minMinutes)>=0&&Number(q.minMinutes)<=60?q.minMinutes:''};
 return <NbaWorkspace userKey={'moskprops-ticket-reader-v1:'+user.id} initialDate={jornadaDateAllowed(q.date)?q.date:argDate()} initialPlayer={typeof q.player==='string'&&/^[1-9]\d{0,9}$/.test(q.player)?Number(q.player):null} initialSelection={initialSelection}/>;
}
