import "server-only";
import { and, eq, inArray, desc, asc } from "drizzle-orm";
import { db, t } from "@/db";
import { computeLedger, type Ledger } from "./ledger";
import { todayISO } from "./dates";

const approved = eq(t.payments.status, "approved");

/** Estado de cuenta completo de un participante. */
export async function loadParticipantAccount(participantId: number, today = todayISO()) {
  const [obligations, charges, payments] = await Promise.all([
    db.select().from(t.obligations).where(eq(t.obligations.participantId, participantId)).orderBy(asc(t.obligations.id)),
    db.select().from(t.charges).where(eq(t.charges.participantId, participantId)).orderBy(asc(t.charges.dueDate), asc(t.charges.id)),
    db.select().from(t.payments).where(eq(t.payments.participantId, participantId)).orderBy(desc(t.payments.paidOn), desc(t.payments.id)),
  ]);
  const ledger = computeLedger(
    charges,
    payments.filter((p) => p.status === "approved"),
    today,
  );
  return { obligations, charges, payments, ledger, today };
}

export type Account = Awaited<ReturnType<typeof loadParticipantAccount>>;

/** Ledger de todos los participantes (para dashboard y cron). Escala sin problema a decenas de usuarios. */
export async function loadAllLedgers(today = todayISO()) {
  const [participants, charges, payments] = await Promise.all([
    db.select().from(t.participants).orderBy(asc(t.participants.name)),
    db.select().from(t.charges),
    db.select().from(t.payments).where(approved),
  ]);
  const map = new Map<number, Ledger>();
  for (const p of participants) {
    map.set(
      p.id,
      computeLedger(
        charges.filter((c) => c.participantId === p.id),
        payments.filter((x) => x.participantId === p.id),
        today,
      ),
    );
  }
  return { participants, charges, ledgers: map, today };
}

export async function pendingPaymentsCount() {
  const rows = await db.select({ id: t.payments.id }).from(t.payments).where(eq(t.payments.status, "pending"));
  return rows.length;
}

export async function obligationsByIds(ids: number[]) {
  if (!ids.length) return [];
  return db.select().from(t.obligations).where(inArray(t.obligations.id, ids));
}

export async function participantById(id: number) {
  const [p] = await db.select().from(t.participants).where(eq(t.participants.id, id));
  return p ?? null;
}

export async function activeParticipants() {
  return db.select().from(t.participants).where(and(eq(t.participants.active, true))).orderBy(asc(t.participants.name));
}
