import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { db, t } from "@/db";
import { isAdmin } from "@/lib/auth";
import { todayISO } from "@/lib/dates";

/** Respaldo completo (JSON) o movimientos en CSV. Solo administrador. */
export async function GET(req: NextRequest) {
  // Admin con sesión, o respaldo automatizado con "Authorization: Bearer <CRON_SECRET>"
  const secret = process.env.CRON_SECRET;
  const h = (s: string) => createHash("sha256").update(s).digest();
  const bearerOk =
    !!secret && timingSafeEqual(h(req.headers.get("authorization") ?? ""), h(`Bearer ${secret}`));
  if (!bearerOk && !(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const format = req.nextUrl.searchParams.get("format") ?? "json";
  const [participants, services, obligations, charges, payments, reminders, settings] = await Promise.all([
    db.select().from(t.participants),
    db.select().from(t.services),
    db.select().from(t.obligations),
    db.select().from(t.charges),
    db.select().from(t.payments),
    db.select().from(t.reminders),
    db.select().from(t.settings),
  ]);
  const stamp = todayISO();

  if (format === "csv") {
    const names = new Map(participants.map((p) => [p.id, p.name]));
    const obs = new Map(obligations.map((o) => [o.id, o.title]));
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["fecha", "tipo", "persona", "sentido", "concepto", "monto", "estado/método"].join(",")];
    for (const c of charges)
      lines.push([c.dueDate, "cargo", names.get(c.participantId), c.direction, c.description, (c.amountCents / 100).toFixed(2), c.kind].map(esc).join(","));
    for (const p of payments)
      lines.push(
        [p.paidOn, "pago", names.get(p.participantId), p.direction, p.obligationId ? obs.get(p.obligationId) : "", (p.amountCents / 100).toFixed(2), `${p.status}/${p.method}`]
          .map(esc)
          .join(","),
      );
    return new NextResponse("﻿" + lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cobro-movimientos-${stamp}.csv"`,
      },
    });
  }

  const body = JSON.stringify(
    { exportedAt: new Date().toISOString(), participants, services, obligations, charges, payments, reminders, settings },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="cobro-respaldo-${stamp}.json"`,
    },
  });
}
