import {withAuth} from '@/lib/auth/server';
import {NextResponse} from 'next/server';
import {getInjuryReport} from '@/lib/injuryReportData';
import {isDate,argentinaDate} from '@/lib/ticketReader/model';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=withAuth(async(req:Request)=>{const date=new URL(req.url).searchParams.get('date')??argentinaDate();if(!isDate(date))return NextResponse.json({ok:false,error:'Fecha inválida.'},{status:400});return NextResponse.json(await getInjuryReport(date),{headers:{'Cache-Control':'private, no-store'}});});
