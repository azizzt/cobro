"use server";

import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, t } from "@/db";
import { requireAdmin, newAccessToken, clearSessions } from "@/lib/auth";
import { FormError, bool, cents, flash, guard, int, isoDate, reqStr, saveEvidence, str } from "@/lib/forms";
import { audit } from "@/lib/audit";
import { todayISO } from "@/lib/dates";
import { money } from "@/lib/money";
import { loadParticipantAccount, participantById } from "@/lib/data";
import { createReminder, generateCharges, runDaily } from "@/lib/jobs";
import { getSettings, saveSettings, SETTING_DEFAULTS, type SettingKey } from "@/lib/settings";
import { normalizePhone } from "@/lib/notify";

export async function logout() {
  await clearSessions();
  redirect("/");
}

// ── Participantes ──────────────────────────────────────────────────────

function participantValues(fd: FormData) {
  const phoneRaw = str(fd, "phone");
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) throw new FormError("Teléfono inválido (usa 10 dígitos o formato internacional)");
  return {
    name: reqStr(fd, "name", "nombre"),
    phone,
    email: str(fd, "email"),
    notes: str(fd, "notes"),
    notifyWhatsapp: bool(fd, "notifyWhatsapp"),
    notifyEmail: bool(fd, "notifyEmail"),
  };
}

export async function createParticipant(fd: FormData) {
  await requireAdmin();
  let id: number;
  try {
    const [p] = await db
      .insert(t.participants)
      .values({ ...participantValues(fd), accessToken: newAccessToken() })
      .returning();
    id = p.id;
    await audit("admin", "participant.create", { participantId: p.id, entity: "participant", entityId: p.id });
  } catch (e) {
    if (e instanceof FormError) flash("/admin/participants", { error: e.message });
    throw e;
  }
  flash(`/admin/participants/${id}`, { ok: "Participante creado. Comparte su enlace personal." });
}

export async function updateParticipant(id: number, fd: FormData) {
  await requireAdmin();
  await guard(`/admin/participants/${id}`, async () => {
    await db.update(t.participants).set(participantValues(fd)).where(eq(t.participants.id, id));
    await audit("admin", "participant.update", { participantId: id });
    return "Datos actualizados";
  });
}

export async function regenerateLink(id: number) {
  await requireAdmin();
  await db.update(t.participants).set({ accessToken: newAccessToken() }).where(eq(t.participants.id, id));
  await audit("admin", "participant.regenerate_link", { participantId: id });
  flash(`/admin/participants/${id}`, { ok: "Enlace regenerado. El anterior ya no funciona." });
}

export async function toggleParticipant(id: number) {
  await requireAdmin();
  const p = await participantById(id);
  if (!p) flash("/admin/participants", { error: "No existe" });
  await db.update(t.participants).set({ active: !p.active }).where(eq(t.participants.id, id));
  flash(`/admin/participants/${id}`, { ok: p.active ? "Participante desactivado" : "Participante activado" });
}

export async function deleteParticipant(id: number) {
  await requireAdmin();
  await db.delete(t.participants).where(eq(t.participants.id, id));
  await audit("admin", "participant.delete", { participantId: id });
  flash("/admin/participants", { ok: "Participante eliminado con todo su historial" });
}

// ── Plataformas (servicios) ────────────────────────────────────────────

function serviceValues(fd: FormData) {
  const day = int(fd, "billingDay");
  if (day != null && (day < 1 || day > 31)) throw new FormError("Día de cobro inválido");
  return {
    name: reqStr(fd, "name", "nombre"),
    monthlyCostCents: cents(fd, "monthlyCost", "costo mensual") ?? 0,
    billingDay: day,
    notes: str(fd, "notes"),
    // el formulario de edición envía un hidden "false" + checkbox "on"
    active: fd.has("active") ? fd.getAll("active").includes("on") : true,
  };
}

export async function saveService(id: number | null, fd: FormData) {
  await requireAdmin();
  await guard("/admin/services", async () => {
    if (id) await db.update(t.services).set(serviceValues(fd)).where(eq(t.services.id, id));
    else await db.insert(t.services).values(serviceValues(fd));
    return id ? "Plataforma actualizada" : "Plataforma agregada";
  });
}

export async function deleteService(id: number) {
  await requireAdmin();
  await db.delete(t.services).where(eq(t.services.id, id));
  flash("/admin/services", { ok: "Plataforma eliminada" });
}

// ── Obligaciones (suscripciones, MSI, préstamos, cargos únicos) ────────

function obligationValues(fd: FormData) {
  const kind = reqStr(fd, "kind", "tipo") as "subscription" | "installment" | "loan" | "one_time";
  const direction = reqStr(fd, "direction", "sentido") as "receivable" | "payable";
  let frequency = (str(fd, "frequency") ?? "monthly") as "monthly" | "biweekly" | "weekly" | "once";
  const startDate = isoDate(fd, "startDate", "primer vencimiento");
  if (!startDate) throw new FormError("Falta la fecha del primer vencimiento");
  const amountPerPeriodCents = cents(fd, "amountPerPeriod", "monto por periodo");
  const totalAmountCents = cents(fd, "totalAmount", "monto total");
  let periodsTotal = int(fd, "periodsTotal");

  if (kind === "one_time") {
    frequency = "once";
    periodsTotal = 1;
    if (!totalAmountCents) throw new FormError("Indica el monto total");
  } else if (kind === "subscription") {
    if (!amountPerPeriodCents) throw new FormError("Indica el monto por periodo");
  } else {
    if (!periodsTotal || periodsTotal < 1) throw new FormError("Indica el número de pagos/meses");
    if (!totalAmountCents && !amountPerPeriodCents)
      throw new FormError("Indica el monto total o el monto por periodo");
  }
  if (periodsTotal != null && periodsTotal > 360) throw new FormError("Máximo 360 periodos");

  return {
    participantId: int(fd, "participantId")!,
    serviceId: kind === "subscription" ? int(fd, "serviceId") : null,
    kind,
    direction,
    title: reqStr(fd, "title", "concepto"),
    description: str(fd, "description"),
    frequency,
    amountPerPeriodCents: kind === "one_time" ? null : amountPerPeriodCents,
    totalAmountCents: kind === "subscription" ? null : totalAmountCents,
    periodsTotal: kind === "subscription" ? (periodsTotal ?? null) : periodsTotal,
    startDate,
    endDate: isoDate(fd, "endDate", "fecha fin"),
    lateFeeCents: cents(fd, "lateFee", "recargo") ?? 0,
  };
}

export async function saveObligation(id: number | null, fd: FormData) {
  await requireAdmin();
  const back = id ? `/admin/obligations/${id}` : "/admin/obligations/new";
  let newId = id;
  try {
    const values = obligationValues(fd);
    if (!values.participantId) throw new FormError("Selecciona un participante");
    if (id) {
      await db.update(t.obligations).set(values).where(eq(t.obligations.id, id));
      // Recalcular calendario: los cargos regulares se regeneran; los pagos se
      // vuelven a aplicar automáticamente porque la asignación es calculada.
      await db
        .delete(t.charges)
        .where(and(eq(t.charges.obligationId, id), eq(t.charges.kind, "regular")));
      await db.update(t.charges).set({ participantId: values.participantId, direction: values.direction }).where(eq(t.charges.obligationId, id));
      await db.update(t.payments).set({ participantId: values.participantId }).where(eq(t.payments.obligationId, id));
    } else {
      const [o] = await db.insert(t.obligations).values(values).returning({ id: t.obligations.id });
      newId = o.id;
    }
    await generateCharges(todayISO(), await getSettings(), newId!);
    await audit("admin", id ? "obligation.update" : "obligation.create", {
      participantId: values.participantId,
      entity: "obligation",
      entityId: newId!,
    });
  } catch (e) {
    if (e instanceof FormError) flash(back, { error: e.message });
    throw e;
  }
  flash(`/admin/obligations/${newId}`, { ok: id ? "Obligación actualizada y calendario recalculado" : "Obligación creada" });
}

export async function setObligationStatus(id: number, status: "active" | "paused" | "completed" | "cancelled") {
  await requireAdmin();
  await db.update(t.obligations).set({ status }).where(eq(t.obligations.id, id));
  if (status === "active") await generateCharges(todayISO(), await getSettings(), id);
  await audit("admin", "obligation.status", { entity: "obligation", entityId: id, details: { status } });
  flash(`/admin/obligations/${id}`, { ok: "Estado actualizado" });
}

export async function deleteObligation(id: number) {
  await requireAdmin();
  const [o] = await db.select().from(t.obligations).where(eq(t.obligations.id, id));
  await db.delete(t.obligations).where(eq(t.obligations.id, id));
  await audit("admin", "obligation.delete", { participantId: o?.participantId, entity: "obligation", entityId: id });
  flash(o ? `/admin/participants/${o.participantId}` : "/admin/obligations", { ok: "Obligación eliminada" });
}

/** Cargo extra manual (p. ej. un mes con precio distinto, un gasto adicional). */
export async function addAdjustment(obligationId: number, fd: FormData) {
  await requireAdmin();
  await guard(`/admin/obligations/${obligationId}`, async () => {
    const [o] = await db.select().from(t.obligations).where(eq(t.obligations.id, obligationId));
    if (!o) throw new FormError("No existe la obligación");
    const amount = cents(fd, "amount", "monto");
    if (!amount) throw new FormError("Indica el monto");
    await db.insert(t.charges).values({
      obligationId,
      participantId: o.participantId,
      direction: o.direction,
      kind: "adjustment",
      periodNumber: null,
      dueDate: isoDate(fd, "dueDate", "fecha") ?? todayISO(),
      amountCents: amount,
      description: str(fd, "description") ?? `Cargo extra · ${o.title}`,
    });
    return "Cargo extra agregado";
  });
}

export async function deleteCharge(chargeId: number, obligationId: number) {
  await requireAdmin();
  await db.delete(t.charges).where(and(eq(t.charges.id, chargeId), inArray(t.charges.kind, ["adjustment", "late_fee"])));
  flash(`/admin/obligations/${obligationId}`, { ok: "Cargo eliminado" });
}

// ── Pagos ──────────────────────────────────────────────────────────────

export async function registerPayment(back: string, fd: FormData) {
  await requireAdmin();
  await guard(back, async () => {
    const participantId = int(fd, "participantId");
    if (!participantId) throw new FormError("Selecciona un participante");
    const amount = cents(fd, "amount", "monto");
    if (!amount) throw new FormError("Indica el monto");
    const direction = reqStr(fd, "direction", "sentido") as "receivable" | "payable";
    const evidenceId = await saveEvidence(fd);
    const [p] = await db
      .insert(t.payments)
      .values({
        participantId,
        obligationId: int(fd, "obligationId"),
        direction,
        amountCents: amount,
        paidOn: isoDate(fd, "paidOn", "fecha") ?? todayISO(),
        method: (str(fd, "method") ?? "transfer") as "transfer",
        reference: str(fd, "reference"),
        note: str(fd, "note"),
        status: "approved",
        evidenceId,
        submittedBy: "admin",
        reviewedAt: new Date(),
      })
      .returning();
    await audit("admin", "payment.register", { participantId, entity: "payment", entityId: p.id, details: { amount, direction } });
    return direction === "receivable" ? `Pago recibido de ${money(amount)} registrado` : `Pago enviado de ${money(amount)} registrado`;
  });
}

export async function reviewPayment(id: number, back: string, fd: FormData) {
  await requireAdmin();
  const decision = str(fd, "decision") === "approve" ? "approved" : "rejected";
  const note = str(fd, "reviewNote");
  const [p] = await db
    .update(t.payments)
    .set({ status: decision, reviewNote: note, reviewedAt: new Date() })
    .where(eq(t.payments.id, id))
    .returning();
  if (p) {
    await audit("admin", `payment.${decision}`, { participantId: p.participantId, entity: "payment", entityId: id });
    // Aviso al participante en su portal
    await db.insert(t.reminders).values({
      participantId: p.participantId,
      type: "payment_update",
      forDate: todayISO(),
      message:
        decision === "approved"
          ? `✅ Tu pago de ${money(p.amountCents)} fue confirmado. ¡Gracias!`
          : `⚠️ Tu comprobante de ${money(p.amountCents)} fue rechazado${note ? `: ${note}` : ""}. Revísalo y vuelve a enviarlo.`,
      channel: "portal",
      status: "sent",
      sentAt: new Date(),
      createdBy: "admin",
    });
  }
  flash(back, { ok: decision === "approved" ? "Pago aprobado" : "Pago rechazado" });
}

export async function deletePayment(id: number, back: string) {
  await requireAdmin();
  const [p] = await db.delete(t.payments).where(eq(t.payments.id, id)).returning();
  if (p?.evidenceId) await db.delete(t.evidenceFiles).where(eq(t.evidenceFiles.id, p.evidenceId));
  await audit("admin", "payment.delete", { participantId: p?.participantId, entity: "payment", entityId: id, details: p ? { amount: p.amountCents } : undefined });
  flash(back, { ok: "Pago eliminado" });
}

/**
 * Compensación: si yo le debo y él/ella me debe, se cancelan mutuamente por
 * el monto menor (dos movimientos tipo "offset", uno por sentido).
 */
export async function offsetBalances(participantId: number) {
  await requireAdmin();
  const back = `/admin/participants/${participantId}`;
  const acc = await loadParticipantAccount(participantId);
  const amount = Math.min(acc.ledger.receivable.balance, acc.ledger.payable.balance);
  if (amount <= 0) flash(back, { error: "No hay saldos en ambos sentidos para compensar" });
  const today = todayISO();
  const base = {
    participantId,
    amountCents: amount,
    paidOn: today,
    method: "offset" as const,
    status: "approved" as const,
    submittedBy: "admin" as const,
    reviewedAt: new Date(),
    note: "Compensación de saldos",
  };
  await db.insert(t.payments).values([
    { ...base, direction: "receivable" },
    { ...base, direction: "payable" },
  ]);
  await audit("admin", "payment.offset", { participantId, details: { amount } });
  flash(back, { ok: `Se compensaron ${money(amount)} en ambos sentidos` });
}

// ── Recordatorios ──────────────────────────────────────────────────────

export async function sendManualReminder(participantId: number, back: string, fd: FormData) {
  await requireAdmin();
  const p = await participantById(participantId);
  if (!p) flash(back, { error: "No existe" });
  const acc = await loadParticipantAccount(participantId);
  const r = await createReminder(p, acc, "manual", await getSettings(), "admin", str(fd, "message") ?? undefined);
  flash(back, {
    ok:
      r.channel === "whatsapp_link"
        ? "Recordatorio creado: tócalo en la lista para enviarlo por WhatsApp"
        : "Recordatorio enviado",
  });
}

export async function markReminderSent(id: number) {
  await requireAdmin();
  await db.update(t.reminders).set({ status: "sent", sentAt: new Date() }).where(eq(t.reminders.id, id));
  revalidatePath("/admin", "layout");
}

export async function skipReminder(id: number, back: string) {
  await requireAdmin();
  await db.update(t.reminders).set({ status: "skipped" }).where(eq(t.reminders.id, id));
  flash(back, { ok: "Recordatorio descartado" });
}

// ── Configuración y mantenimiento ──────────────────────────────────────

export async function saveSettingsAction(fd: FormData) {
  await requireAdmin();
  const values: Partial<Record<SettingKey, string>> = {};
  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    if (key === "auto_reminders") values[key] = bool(fd, key) ? "true" : "false";
    else {
      const v = fd.get(key);
      if (typeof v === "string") values[key] = v.trim();
    }
  }
  await saveSettings(values);
  flash("/admin/settings", { ok: "Configuración guardada" });
}

export async function runCronNow(fd: FormData) {
  await requireAdmin();
  const s = await runDaily({ skipReminders: !bool(fd, "withReminders") });
  flash("/admin/settings", {
    ok: `Proceso ejecutado: ${s.charges} cargos nuevos, ${s.lateFees} recargos, ${s.reminders} recordatorios, ${s.completed} obligaciones terminadas`,
  });
}
