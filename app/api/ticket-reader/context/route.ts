import {NextResponse} from 'next/server';
import {withAuth} from '@/lib/auth/server';
import {getCurrentRosterPlayer,CURRENT_ROSTER_UPDATED_AT} from '@/lib/currentRosters';
import {ticketSchedule} from '@/lib/ticketReader/calendar';
import {rosterFitsDate} from '@/lib/ticketReader/teamContext';
import {isDate} from '@/lib/ticketReader/model';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=withAuth(async(req:Request)=>{
 const q=new URL(req.url).searchParams,raw=q.get('playerId')??'',date=q.get('date');
 if(!/^[1-9]\d{0,12}$/.test(raw)||!Number.isSafeInteger(Number(raw))||!isDate(date))return NextResponse.json({ok:false,error:'Jugador o fecha inválidos.'},{status:400});
 const mode=q.get('mode');if(mode!==null){if(!['upcoming','day'].includes(mode))return NextResponse.json({ok:false,error:'Modo de calendario inválido.'},{status:400});try{const {getPlayerEvent}=await import('@/lib/playerEventData');return NextResponse.json(await getPlayerEvent(Number(raw),date,mode as 'upcoming'|'day'),{headers:{'Cache-Control':'private, no-store'}});}catch{return NextResponse.json({ok:false,error:'No pudimos comprobar el calendario.'},{status:503});}}
 const player=getCurrentRosterPlayer(Number(raw));
 const base={ok:true,playerId:Number(raw),date,team:player?.team_abbreviation??null,referenceAt:CURRENT_ROSTER_UPDATED_AT,verified:false,games:[] as {id:string;away:string;home:string}[],available:false};
 if(!player)return NextResponse.json({...base,message:'No tenemos un equipo actual confirmado para este jugador. Podés completar el partido manualmente.'},{headers:{'Cache-Control':'private, no-store'}});
 if(!rosterFitsDate(date,CURRENT_ROSTER_UPDATED_AT))return NextResponse.json({...base,message:'El plantel de referencia no permite completar esa fecha automáticamente. Revisá los equipos.'},{headers:{'Cache-Control':'private, no-store'}});
 const schedule=await ticketSchedule(date),games=schedule.games.filter(g=>g.away===player.team_abbreviation||g.home===player.team_abbreviation);
 return NextResponse.json({...base,available:schedule.available,verified:schedule.available,games,message:!schedule.available?'No pudimos comprobar el calendario. Podés completar los equipos manualmente.':!games.length?'No encontramos un partido de su equipo para esa fecha.':games.length===1?'Partido encontrado en el calendario.':'Elegí el partido de esa fecha.'},{headers:{'Cache-Control':'private, no-store'}});
});
