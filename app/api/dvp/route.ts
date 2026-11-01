import {withAuth} from '@/lib/auth/server';
import {NextResponse} from 'next/server';
import {defenseSettings,DEFENSE_GROUPS,rankFor} from '@/lib/nbaDefense';
import {getDefenseReport} from '@/lib/nbaDefenseData';
import {argentinaDate} from '@/lib/ticketReader/model';
export const GET=withAuth(async(req:Request)=>{
 const q=new URL(req.url).searchParams,settings=defenseSettings({market:'pts',position:q.get('position')||'ALL',opponent:q.get('team'),asOfDate:q.get('asOfDate')||argentinaDate(),...(q.has('season')?{season:q.get('season')}:{})},argentinaDate()),headers={'Cache-Control':'private, no-store'};
 if(!settings?.opponent)return NextResponse.json({ok:false,error:'Equipo o posición inválidos.'},{status:400,headers});
 try{
  const markets=['pts','reb','ast','fg3m'] as const,reports=await Promise.all(markets.map(market=>getDefenseReport({...settings,market})));
  const first=reports[0];
  return NextResponse.json({ok:true,team:settings.opponent,found:first.available,requestedPosition:q.get('position'),positionGroup:settings.position,resolvedPositionGroup:settings.position,positionLabel:DEFENSE_GROUPS[settings.position],season:settings.season,phase:settings.phase,scope:'FULL',updatedAt:first.through,archiveId:first.archiveId,message:first.reason,metrics:markets.map((m,i)=>{const row=rankFor(reports[i],settings.opponent!,settings.position);return {key:m,label:m==='fg3m'?'3PM':m.toUpperCase(),value:row?.allowed??null,leagueAvg:row?.leagueAverage??null,diff:row?.allowed!==null&&row?.allowed!==undefined&&row.leagueAverage!==null?row.allowed-row.leagueAverage:null,favorable:null,rank:row?.rank??null,games:row?.games??0,total:row?.total??0};})},{headers});
 }catch{return NextResponse.json({ok:false,error:'No pudimos leer el resumen defensivo.'},{status:503,headers});}
});
