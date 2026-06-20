import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js reads .env.local; load it (then .env) so the Prisma CLI sees the same
// DATABASE_URL the app uses at runtime.
dotenv.config({ path: ".env.local" });
dotenv.config();

// For migrations prefer a DIRECT (non-pooled) connection — pooled/pgbouncer URLs
// can break migrate. Neon/Vercel set several of these names.
const migrationUrl =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: migrationUrl },
});
