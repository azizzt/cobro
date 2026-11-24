import "server-only";
import { and, eq, ne, inArray } from "drizzle-orm";
import { db, t } from "@/db";
import type { Participant, Reminder } from "@/db/schema";
import { addDays, diffDays, fmtDate, relativeDue, todayISO } from "./dates";
import { periodsDueUntil, totalPeriods } from "./schedule";
import { loadAllLedgers, loadParticipantAccount, type Account } from "./data";
import { getSettings, num, type Settings } from "./settings";
import { money } from "./money";
import {
  emailEnabled,
  notifyAdmin,
  portalLink,
  sendEmail,
  sendWhatsAppTemplate,
  whatsappApiEnabled,
  normalizePhone,
} from "./notify";
import { audit } from "./audit";

// ── 1. Generación de cargos ────────────────────────────────────────────

/** Crea los cargos que vencen hasta hoy + N días. Idempotente (índice único). */
export async function generateCharges(today: string, settings: Settings, obligationId?: number) {
  const lead = num(settings.charge_lead_days, 7);
  const until = addDays(today, lead);
  const where = obligationId
    ? eq(t.obligations.id, obligationId)
    : eq(t.obligations.status, "active");
  const obs = await db.select().from(t.obligations).where(where);
  let created = 0;
  for (const o of obs) {
    if (o.status !== "active") continue;
    const rows = periodsDueUntil(o, until).map((p) => ({
      obligationId: o.id,
      participantId: o.participantId,
      direction: o.direction,
      kind: "regular" as const,
      periodNumber: p.n,
      dueDate: p.due,
      amountCents: p.amount,
      description: periodLabel(o.title, p.n, totalPeriods(o)),
    }));
    if (!rows.length) continue;
    const inserted = await db.insert(t.charges).values(rows).onConflictDoNothing().returning({ id: t.charges.id });
    created += inserted.length;
  }
  return created;
}

export function periodLabel(title: string, n: number, total: number | null) {
  return total ? `${title} · ${n}/${total}` : `${title} · periodo ${n}`;
}

// ── 2. Recargos por atraso (opcional por obligación) ───────────────────

export async function applyLateFees(today: string, settings: Settings) {
  const grace = num(settings.late_fee_grace_days, 5);
  const obs = await db
    .select()
    .from(t.obligations)
    .where(and(eq(t.obligations.status, "active"), eq(t.obligations.direction, "receivable")));
  const withFee = obs.filter((o) => o.lateFeeCents > 0);
  if (!withFee.length) return 0;
  let created = 0;
  const byParticipant = new Map<number, Account>();
  for (const o of withFee) {
    let acc = byParticipant.get(o.participantId);
    if (!acc) {
      acc = await loadParticipantAccount(o.participantId, today);
      byParticipant.set(o.participantId, acc);
    }
    for (const c of acc.charges) {
      if (c.obligationId !== o.id || c.kind !== "regular") continue;
      const st = acc.ledger.charges.get(c.id);
      if (!st || st.remaining <= 0 || diffDays(c.dueDate, today) <= grace) continue;
      const res = await db
        .insert(t.charges)
        .values({
          obligationId: o.id,
          participantId: o.participantId,
          direction: o.direction,
          kind: "late_fee",
          periodNumber: c.periodNumber,
          dueDate: today,
          amountCents: o.lateFeeCents,
          description: `Recargo por atraso · ${c.description ?? o.title}`,
        })
        .onConflictDoNothing()
        .returning({ id: t.charges.id });
      created += res.length;
    }
  }
  return created;
}

// ── 3. Obligaciones terminadas ─────────────────────────────────────────

export async function completeFinishedObligations(today: string) {
  const { ledgers } = await loadAllLedgers(today);
  const obs = await db.select().from(t.obligations).where(eq(t.obligations.status, "active"));
  let done = 0;
  for (const o of obs) {
    const total = totalPeriods(o);
    if (!total) continue;
    const ob = ledgers.get(o.participantId)?.obligations.get(o.id);
    if (ob && ob.regularCount >= total && ob.outstanding === 0) {
      await db.update(t.obligations).set({ status: "completed" }).where(eq(t.obligations.id, o.id));
      await audit("system", "obligation.completed", { participantId: o.participantId, entity: "obligation", entityId: o.id });
      done++;
    }
  }
  return done;
}

// ── 4. Recordatorios ───────────────────────────────────────────────────

type ReminderKind = "upcoming" | "due" | "overdue" | "manual";

/** Texto del recordatorio con el detalle de lo pendiente. */
export function buildReminderText(p: Participant, acc: Account, kind: ReminderKind, settings: Settings) {
  const open = acc.charges
    .filter((c) => c.direction === "receivable")
    .map((c) => ({ c, st: acc.ledger.charges.get(c.id)! }))
    .filter(({ st }) => st.remaining > 0);
  const lines = open
    .slice(0, 8)
    .map(({ c, st }) => `• ${c.description ?? "Cargo"}: ${money(st.remaining)} (${relativeDue(c.dueDate, acc.today)})`);
  if (open.length > 8) lines.push(`• …y ${open.length - 8} más`);
  const total = acc.ledger.receivable.balance;
  const intro: Record<ReminderKind, string> = {
    upcoming: "te recuerdo que se acerca tu próximo pago:",
    due: "hoy vence tu pago:",
    overdue: "tienes pagos vencidos pendientes:",
    manual: "te comparto tu estado de cuenta:",
  };
  const first = p.name.split(" ")[0];
  return [
    `Hola ${first} 👋, ${intro[kind]}`,
    "",
    ...lines,
    "",
    `Total pendiente: ${money(total)}`,
    `Consulta tu detalle, marca "Enterado" y sube tu comprobante aquí: ${portalLink(p.accessToken)}`,
    "",
    `Gracias — ${settings.owner_name}`,
  ].join("\n");
}

/** Decide el tipo de recordatorio automático para hoy (o null si no toca). */
export function autoReminderKind(acc: Account, settings: Settings): ReminderKind | null {
  const before = num(settings.remind_days_before, 3);
  const repeat = Math.max(1, num(settings.overdue_repeat_days, 3));
  let kind: ReminderKind | null = null;
  for (const c of acc.charges) {
    if (c.direction !== "receivable") continue;
    const st = acc.ledger.charges.get(c.id);
    if (!st || st.remaining <= 0) continue;
    const d = diffDays(acc.today, c.dueDate); // >0 futuro, <0 vencido
    if (d < 0 && (-d - 1) % repeat === 0) return "overdue"; // día 1, 1+N, 1+2N… de atraso
    if (d === 0) kind = "due";
    else if (d === before && kind == null) kind = "upcoming";
  }
  // si hay saldo vencido pero hoy no toca repetir, no molestar
  return kind;
}

/** Envía por el mejor canal disponible y actualiza el estado del recordatorio. */
export async function dispatchReminder(r: Reminder, p: Participant, total: number) {
  const done = (patch: Partial<Reminder>) =>
    db.update(t.reminders).set(patch).where(eq(t.reminders.id, r.id));
  try {
    if (r.channel === "whatsapp_api") {
      await sendWhatsAppTemplate(p.phone!, [p.name.split(" ")[0], money(total), portalLink(p.accessToken)]);
      await done({ status: "sent", sentAt: new Date() });
    } else if (r.channel === "email") {
      await sendEmail(p.email!, "Recordatorio de pago", r.message);
      await done({ status: "sent", sentAt: new Date() });
    } else if (r.channel === "portal") {
      await done({ status: "sent", sentAt: new Date() });
    }
    // whatsapp_link queda "pending" hasta que el admin lo envía desde el panel
    if (r.channel !== "email" && p.notifyEmail && p.email && emailEnabled()) {
      await sendEmail(p.email, "Recordatorio de pago", r.message).catch(() => {});
    }
  } catch (e) {
    await done({ status: "failed", error: String((e as Error).message ?? e).slice(0, 500) });
  }
}

export function pickChannel(p: Participant): Reminder["channel"] {
  const phone = normalizePhone(p.phone);
  if (p.notifyWhatsapp && phone && whatsappApiEnabled()) return "whatsapp_api";
  if (p.notifyEmail && p.email && emailEnabled()) return "email";
  if (p.notifyWhatsapp && phone) return "whatsapp_link";
  return "portal";
}

export async function createReminder(
  p: Participant,
  acc: Account,
  kind: ReminderKind,
  settings: Settings,
  createdBy: "admin" | "system",
  customMessage?: string,
) {
  const [r] = await db
    .insert(t.reminders)
    .values({
      participantId: p.id,
      type: kind,
      forDate: acc.today,
      message: customMessage?.trim() || buildReminderText(p, acc, kind, settings),
      channel: pickChannel(p),
      createdBy,
    })
    .returning();
  await dispatchReminder(r, p, acc.ledger.receivable.balance);
  return r;
}

export async function createAutoReminders(today: string, settings: Settings) {
  if (settings.auto_reminders !== "true") return 0;
  const participants = await db.select().from(t.participants).where(eq(t.participants.active, true));
  // ¿ya hay recordatorio automático hoy para este participante?
  const todays = await db
    .select({ pid: t.reminders.participantId })
    .from(t.reminders)
    .where(and(eq(t.reminders.forDate, today), ne(t.reminders.type, "manual"), ne(t.reminders.type, "payment_update")));
  const already = new Set(todays.map((r) => r.pid));
  let n = 0;
  for (const p of participants) {
    if (already.has(p.id)) continue;
    const acc = await loadParticipantAccount(p.id, today);
    // Si en neto YO le debo más de lo que me debe, no tiene sentido cobrarle:
    // mejor compensar saldos desde su ficha.
    if (acc.ledger.net <= 0) continue;
    const kind = autoReminderKind(acc, settings);
    if (!kind) continue;
    await createReminder(p, acc, kind, settings, "system");
    n++;
  }
  return n;
}

// ── 5. Resumen para el administrador ───────────────────────────────────

export async function adminDigest(today: string) {
  const { participants, ledgers, charges } = await loadAllLedgers(today);
  const pending = await db.select().from(t.payments).where(eq(t.payments.status, "pending"));
  const name = (id: number) => participants.find((p) => p.id === id)?.name ?? `#${id}`;

  // lo que YO debo y vence en los próximos 3 días o ya venció
  const myDue = charges.filter((c) => {
    if (c.direction !== "payable") return false;
    const st = ledgers.get(c.participantId)?.charges.get(c.id);
    return st && st.remaining > 0 && diffDays(today, c.dueDate) <= 3;
  });
  const overdue = participants
    .map((p) => ({ p, l: ledgers.get(p.id)! }))
    .filter(({ l }) => l.receivable.overdue > 0);

  if (!pending.length && !myDue.length && !overdue.length) return false;
  const lines = [`Resumen ${fmtDate(today)}`];
  if (pending.length) lines.push(`📎 ${pending.length} comprobante(s) por revisar`);
  if (overdue.length)
    lines.push(
      `⏰ Vencidos: ${overdue.map(({ p, l }) => `${p.name} ${money(l.receivable.overdue)}`).join(", ")}`,
    );
  if (myDue.length)
    lines.push(`💸 Tú debes pagar: ${myDue.map((c) => `${name(c.participantId)} ${money(c.amountCents)} (${relativeDue(c.dueDate, today)})`).join(", ")}`);
  await notifyAdmin(lines.join("\n"), "Cobro: resumen diario");
  return true;
}

// ── Orquestador del cron diario ────────────────────────────────────────

export async function runDaily(opts: { today?: string; skipReminders?: boolean } = {}) {
  const today = opts.today ?? todayISO();
  const settings = await getSettings();
  const charges = await generateCharges(today, settings);
  const lateFees = await applyLateFees(today, settings);
  const completed = await completeFinishedObligations(today);
  const reminders = opts.skipReminders ? 0 : await createAutoReminders(today, settings);
  const digest = opts.skipReminders ? false : await adminDigest(today);
  const summary = { today, charges, lateFees, completed, reminders, digest };
  await audit("system", "cron.daily", { details: summary });
  return summary;
}

export async function regenerateFor(obligationIds: number[]) {
  if (!obligationIds.length) return;
  const settings = await getSettings();
  const today = todayISO();
  const obs = await db.select({ id: t.obligations.id }).from(t.obligations).where(inArray(t.obligations.id, obligationIds));
  for (const o of obs) await generateCharges(today, settings, o.id);
}
