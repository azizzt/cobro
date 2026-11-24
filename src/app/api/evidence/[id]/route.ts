import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { currentParticipant, isAdmin } from "@/lib/auth";

/** Sirve un comprobante. Solo el admin o el participante dueño del pago. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return new NextResponse("No encontrado", { status: 404 });

  if (!(await isAdmin())) {
    const p = await currentParticipant();
    if (!p) return new NextResponse("No autorizado", { status: 401 });
    const [pay] = await db.select({ pid: t.payments.participantId }).from(t.payments).where(eq(t.payments.evidenceId, id));
    if (!pay || pay.pid !== p.id) return new NextResponse("No autorizado", { status: 403 });
  }

  const [f] = await db.select().from(t.evidenceFiles).where(eq(t.evidenceFiles.id, id));
  if (!f) return new NextResponse("No encontrado", { status: 404 });
  return new NextResponse(Buffer.from(f.data), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(f.filename)}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
