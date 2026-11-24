import "server-only";
import { createDb, type DB } from "./client";

const g = globalThis as unknown as { __cobroDb?: DB };

/**
 * Conexión única por proceso, creada en el primer uso (no al importar, para
 * que `next build` no necesite base de datos y para evitar múltiples
 * instancias con HMR en desarrollo).
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = (g.__cobroDb ??= createDb());
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export * as t from "./schema";
