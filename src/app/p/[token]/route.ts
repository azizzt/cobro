import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { startParticipantSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

/** Enlace personal: /p/<token> → crea la sesión del participante y abre su portal. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const [p] = await db.select().from(t.participants).where(eq(t.participants.accessToken, token));
  if (!p || !p.active) {
    return NextResponse.redirect(new URL("/?expired=1", req.url));
  }
  await startParticipantSession(p.id, p.accessToken);
  await db.update(t.participants).set({ lastSeenAt: new Date() }).where(eq(t.participants.id, p.id));
  await audit("participant", "portal.open_link", { participantId: p.id });
  return NextResponse.redirect(new URL("/portal", req.url));
}
