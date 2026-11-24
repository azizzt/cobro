import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import path from "node:path";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

export const LOCAL_DB_DIR = path.join(process.cwd(), ".data", "pglite");

/**
 * Con DATABASE_URL → Postgres real (Neon/Supabase/Azure) vía postgres.js.
 * Sin DATABASE_URL → PGlite (Postgres embebido en ./.data) para desarrollo.
 */
export function createDb(): DB {
  const url = process.env.DATABASE_URL;
  if (url) {
    // prepare:false es necesario con poolers en modo transacción (Neon/Supabase)
    const client = postgres(url, { prepare: false, max: 1, idle_timeout: 20 });
    return drizzlePg(client, { schema });
  }
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_PGLITE) {
    throw new Error("DATABASE_URL no está configurada.");
  }
  const client = new PGlite(LOCAL_DB_DIR);
  return drizzlePglite(client, { schema }) as unknown as DB;
}
