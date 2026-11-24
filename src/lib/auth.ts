import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { timingSafeEqual, randomBytes, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";

const ADMIN_COOKIE = "cobro_admin";
const PART_COOKIE = "cobro_p";
const MAX_AGE = 60 * 60 * 24 * 60; // 60 días

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET debe tener 32+ caracteres");
    return new TextEncoder().encode("dev-only-secret-dev-only-secret-dev-only");
  }
  return new TextEncoder().encode(s);
}

async function sign(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

async function verify(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload;
  } catch {
    return null;
  }
}

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};

// ── Administrador ──────────────────────────────────────────────────────

export function checkAdminPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV !== "production" ? "admin" : "");
  if (!expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function startAdminSession() {
  (await cookies()).set(ADMIN_COOKIE, await sign({ role: "admin" }), cookieOpts);
}

export async function isAdmin(): Promise<boolean> {
  const p = await verify((await cookies()).get(ADMIN_COOKIE)?.value);
  return p?.role === "admin";
}

/** Usar al inicio de cada página y Server Action del panel. */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/login");
}

// ── Participantes (enlace personal) ────────────────────────────────────

export function newAccessToken() {
  return randomBytes(18).toString("base64url");
}

/** Huella del token: si el admin regenera el enlace, las sesiones viejas caducan. */
const fingerprint = (token: string) => createHash("sha256").update(token).digest("base64url").slice(0, 12);

export async function startParticipantSession(participantId: number, accessToken: string) {
  (await cookies()).set(
    PART_COOKIE,
    await sign({ role: "participant", pid: participantId, fp: fingerprint(accessToken) }),
    cookieOpts,
  );
}

export async function currentParticipant() {
  const p = await verify((await cookies()).get(PART_COOKIE)?.value);
  if (p?.role !== "participant" || typeof p.pid !== "number") return null;
  const [row] = await db.select().from(t.participants).where(eq(t.participants.id, p.pid));
  if (!row || !row.active || fingerprint(row.accessToken) !== p.fp) return null;
  return row;
}

export async function requireParticipant() {
  const p = await currentParticipant();
  if (!p) redirect("/?expired=1");
  return p;
}

export async function clearSessions() {
  const c = await cookies();
  c.delete(ADMIN_COOKIE);
  c.delete(PART_COOKIE);
}
