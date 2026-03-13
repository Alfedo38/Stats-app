import { defineConfig } from '@prisma/config';
import dotenv from 'dotenv';

// Esto obliga a Prisma a leer tu archivo .env
dotenv.config();

export default defineConfig({
  earlyAccess: true,
  datasource: {
    url: process.env.DATABASE_URL,
  },
});