import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

async function main() {
  // Migraciones por la conexión directa (sin pooler), recomendado por Neon.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (url) {
    const client = postgres(url, { prepare: false, max: 1 });
    await migratePg(drizzlePg(client), { migrationsFolder: "./drizzle" });
    await client.end();
    console.log("Migraciones aplicadas en", new URL(url).host);
  } else {
    const dir = path.join(process.cwd(), ".data", "pglite");
    fs.mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    await migratePglite(drizzlePglite(client), { migrationsFolder: "./drizzle" });
    await client.close();
    console.log("Migraciones aplicadas en PGlite local:", dir);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
