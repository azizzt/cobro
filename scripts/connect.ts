import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import path from "node:path";
import * as schema from "../src/db/schema";

/** Conexión para scripts (fuera de Next.js). */
export function connect(): { db: PostgresJsDatabase<typeof schema>; close: () => Promise<void> } {
  const url = process.env.DATABASE_URL;
  if (url) {
    const client = postgres(url, { prepare: false, max: 1 });
    return { db: drizzlePg(client, { schema }), close: () => client.end() };
  }
  const client = new PGlite(path.join(process.cwd(), ".data", "pglite"));
  return {
    db: drizzlePglite(client, { schema }) as unknown as PostgresJsDatabase<typeof schema>,
    close: () => client.close(),
  };
}
