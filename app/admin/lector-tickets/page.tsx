import {requirePageUser} from '@/lib/auth/server';
import ReportConsole from './ReportConsole';
export const dynamic='force-dynamic';
export default async function Page(){const user=await requirePageUser({admin:true});return <ReportConsole storageKey={`moskprops-ticket-reader-v1:${user.id}`}/>;}
