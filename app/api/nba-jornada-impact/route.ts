import {NextResponse} from 'next/server';
import {withAuth,readBody} from '@/lib/auth/server';
import {automaticImpactRequest} from '@/lib/jornadaAbsenceImpact';
import {jornadaDateAllowed} from '@/lib/nbaJornada';
import {getAutomaticImpacts} from '@/lib/jornadaAbsenceImpactData';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
export const POST=withAuth(async(req:Request)=>{
 const input=automaticImpactRequest(await readBody(req));
 if(!input||!jornadaDateAllowed(input.date))return NextResponse.json({ok:false,error:'Fecha o jugadores inválidos.'},{status:400,headers});
 try{return NextResponse.json(await getAutomaticImpacts(input),{headers});}
 catch{return NextResponse.json({ok:false,error:'No pudimos verificar las bajas de la jornada. Reintentá.'},{status:503,headers});}
});
