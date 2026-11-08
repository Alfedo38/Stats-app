import {NextResponse} from 'next/server';
import {withAuth} from '@/lib/auth/server';
import {defenseSettings} from '@/lib/nbaDefense';
import {argentinaDate} from '@/lib/ticketReader/model';
import {getDefenseReport} from '@/lib/nbaDefenseData';
export const GET=withAuth(async(req:Request)=>{
 const q=new URL(req.url).searchParams,settings=defenseSettings(Object.fromEntries(q),argentinaDate());
 const rawProfile=q.get('profilePlayer'),profilePlayer=rawProfile===null?null:Number(rawProfile);
 const rawMinutes=q.get('similarMinutes'),similarMinutes=rawMinutes===null?null:Number(rawMinutes);
 const validMinutes=rawMinutes===null||(similarMinutes!==null&&/^\d{1,2}(?:\.\d)?$/.test(rawMinutes)&&similarMinutes>0&&similarMinutes<=80&&profilePlayer&&settings?.position!=='ALL'&&settings?.opponent);
 const headers={'Cache-Control':'private, no-store'};
 if(!settings||!validMinutes||(rawProfile!==null&&(!/^\d{1,10}$/.test(rawProfile)||!profilePlayer||q.get('details')!=='1'))||q.has('details')&&!['0','1'].includes(q.get('details')!))return NextResponse.json({ok:false,error:'Parámetros de defensa inválidos.'},{status:400,headers});
 try{return NextResponse.json(await getDefenseReport(settings,q.get('details')==='1',profilePlayer,similarMinutes),{headers});}
 catch{return NextResponse.json({ok:false,error:'No pudimos leer el resumen defensivo verificado. Reintentá en un momento.'},{status:503,headers});}
});
