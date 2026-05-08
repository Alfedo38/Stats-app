import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// ✅ FIX: El singleton ahora se guarda siempre, no solo en desarrollo.
// Antes, en producción nunca se asignaba al global, lo que causaba que
// cada request creara un PrismaClient nuevo — fuga de conexiones garantizada.
globalForPrisma.prisma = globalForPrisma.prisma || new PrismaClient();

export const prisma = globalForPrisma.prisma;

export default prisma;