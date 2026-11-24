"use server";

import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, t } from "@/db";
import { clearSessions, requireParticipant } from "@/lib/auth";
import { FormError, cents, flash, int, isoDate, saveEvidence, str } from "@/lib/forms";
import { audit } from "@/lib/audit";
import { todayISO } from "@/lib/dates";
import { money } from "@/lib/money";
import { notifyAdmin, appUrl } from "@/lib/notify";

export async function submitPayment(fd: FormData) {
  const p = await requireParticipant();
  try {
    const amount = cents(fd, "amount", "monto");
    if (!amount) throw new FormError("Indica el monto que pagaste");
    const evidenceId = await saveEvidence(fd);
    if (!evidenceId) throw new FormError("Adjunta la captura o PDF del comprobante");
    let obligationId = int(fd, "obligationId");
    if (obligationId) {
      const [o] = await db
        .select({ id: t.obligations.id })
        .from(t.obligations)
        .where(and(eq(t.obligations.id, obligationId), eq(t.obligations.participantId, p.id)));
      if (!o) obligationId = null;
    }
    const [pay] = await db
      .insert(t.payments)
      .values({
        participantId: p.id,
        obligationId,
        direction: "receivable",
        amountCents: amount,
        paidOn: isoDate(fd, "paidOn", "fecha") ?? todayISO(),
        method: "transfer",
        reference: str(fd, "reference"),
        note: str(fd, "note"),
        status: "pending",
        evidenceId,
        submittedBy: "participant",
      })
      .returning();
    await audit("participant", "payment.submit", { participantId: p.id, entity: "payment", entityId: pay.id });
    await notifyAdmin(
      `📎 ${p.name} envió un comprobante por ${money(amount)}. Revísalo: ${appUrl()}/admin/payments`,
      "Cobro: nuevo comprobante",
    );
  } catch (e) {
    if (e instanceof FormError) flash("/portal#pagar", { error: e.message });
    throw e;
  }
  flash("/portal", { ok: "¡Gracias! Tu comprobante fue enviado y será revisado pronto." });
}

export async function acknowledgeReminder(id: number) {
  const p = await requireParticipant();
  await db
    .update(t.reminders)
    .set({ acknowledgedAt: new Date() })
    .where(and(eq(t.reminders.id, id), eq(t.reminders.participantId, p.id), isNull(t.reminders.acknowledgedAt)));
  await audit("participant", "reminder.ack", { participantId: p.id, entity: "reminder", entityId: id });
  flash("/portal", { ok: "Marcado como enterado 👍" });
}

export async function acknowledgeAll() {
  const p = await requireParticipant();
  await db
    .update(t.reminders)
    .set({ acknowledgedAt: new Date() })
    .where(and(eq(t.reminders.participantId, p.id), isNull(t.reminders.acknowledgedAt)));
  flash("/portal", { ok: "Marcado como enterado 👍" });
}

/** El participante confirma que recibió un pago que le hice. */
export async function confirmReceived(paymentId: number) {
  const p = await requireParticipant();
  await db
    .update(t.payments)
    .set({ participantConfirmedAt: new Date() })
    .where(and(eq(t.payments.id, paymentId), eq(t.payments.participantId, p.id), eq(t.payments.direction, "payable")));
  await audit("participant", "payment.confirm_received", { participantId: p.id, entity: "payment", entityId: paymentId });
  await notifyAdmin(`✅ ${p.name} confirmó que recibió tu pago.`);
  flash("/portal", { ok: "¡Gracias por confirmar!" });
}

export async function portalLogout() {
  await clearSessions();
  redirect("/");
}
