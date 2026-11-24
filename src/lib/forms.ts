import "server-only";
import { redirect } from "next/navigation";
import { db, t } from "@/db";
import { parseMoney } from "./money";

export class FormError extends Error {}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

export const reqStr = (fd: FormData, k: string, label: string) => {
  const v = str(fd, k);
  if (!v) throw new FormError(`Falta: ${label}`);
  return v;
};

export const int = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (v == null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

export const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";

/** Monto en pesos → centavos (null si vacío). Lanza FormError si es inválido. */
export const cents = (fd: FormData, k: string, label: string) => {
  const v = str(fd, k);
  if (v == null) return null;
  const n = parseMoney(v);
  if (!Number.isFinite(n) || n < 0) throw new FormError(`Monto inválido: ${label}`);
  return n;
};

export const isoDate = (fd: FormData, k: string, label: string) => {
  const v = str(fd, k);
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new FormError(`Fecha inválida: ${label}`);
  return v;
};

/** Redirige con mensaje (se muestra con <Flash/> leyendo searchParams). */
export function flash(path: string, msg: { ok?: string; error?: string }): never {
  const u = new URL(path, "http://x");
  u.searchParams.delete("ok");
  u.searchParams.delete("error");
  if (msg.ok) u.searchParams.set("ok", msg.ok);
  if (msg.error) u.searchParams.set("error", msg.error);
  redirect(u.pathname + u.search + u.hash);
}

/** Ejecuta la acción y convierte FormError en un mensaje de error visible. */
export async function guard(path: string, fn: () => Promise<string | void>): Promise<never> {
  let ok: string | void;
  try {
    ok = await fn();
  } catch (e) {
    if (e instanceof FormError) flash(path, { error: e.message });
    throw e;
  }
  flash(path, { ok: ok || "Guardado" });
}

const MAX_FILE = 4 * 1024 * 1024;
const ALLOWED = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/;

/** Guarda el comprobante (si viene) y devuelve su id. */
export async function saveEvidence(fd: FormData, key = "evidence"): Promise<number | null> {
  const f = fd.get(key);
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > MAX_FILE) throw new FormError("El archivo pesa más de 4 MB");
  if (!ALLOWED.test(f.type)) throw new FormError("Solo se aceptan imágenes o PDF");
  const data = new Uint8Array(await f.arrayBuffer());
  const [row] = await db
    .insert(t.evidenceFiles)
    .values({ filename: f.name.slice(0, 200), mime: f.type, size: f.size, data })
    .returning({ id: t.evidenceFiles.id });
  return row.id;
}
