import type {Metadata} from 'next';
import {requirePageUser} from '@/lib/auth/server';
import TicketReader from './TicketReader';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Analizar ticket NBA'};
export default async function Page(){const user=await requirePageUser();return <TicketReader storageKey={`moskprops-ticket-reader-v1:${user.id}`} isAdmin={user.role==='admin'}/>;}
