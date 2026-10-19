import { config } from 'dotenv';
import { PrismaClient, Prisma } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(root, '.env') });
config({ path: path.join(root, '.env.local'), override: true });
const requested = process.argv[2];
const date = requested || new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(new Date(date+'T12:00:00Z').getTime()) ||
    new Date(date+'T12:00:00Z').toISOString().slice(0,10) !== date) {
  console.error('Fecha inválida. Uso: node scripts/verificar-tickets-web.mjs 2026-10-20');
  process.exit(1);
}
const prisma = new PrismaClient();
try {
  const tables = await prisma.$queryRaw`SELECT to_regclass('public.ludo_ticket_publications')::text AS tickets`;
  if (!tables[0]?.tickets) {
    console.error('La base DATABASE_URL de esta web no contiene public.ludo_ticket_publications.');
    process.exitCode = 1;
  } else {
    const counts = await prisma.$queryRaw(Prisma.sql`
      SELECT book AS casa, kind AS tipo, proposal->>'status' AS estado, count(*)::int AS cantidad
      FROM (SELECT DISTINCT ON(slot_key) * FROM public.ludo_ticket_publications
        WHERE event_date=${date}::date ORDER BY slot_key,generation_seq DESC) p
      GROUP BY 1,2,3 ORDER BY 1,2,3
    `);
    const total = counts.reduce((sum,r)=>sum+r.cantidad,0);
    console.log(JSON.stringify({ fecha:date, conexion:'DATABASE_URL', publicaciones:counts, total },null,2));
    if (total === 0) {
      console.error('Sin publicaciones para esa fecha en DATABASE_URL. Revisá la fecha y que sea la misma base del motor.');
      process.exitCode = 2;
    }
  }
} catch (error) {
  const pg = error?.meta?.code;
  console.error(pg === '42501' ? 'La conexión de la web no tiene permiso de lectura sobre tickets.' :
    'No se pudieron consultar tickets con DATABASE_URL. Revisá la conexión del proyecto.');
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
