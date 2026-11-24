/**
 * Datos de ejemplo para probar la app en local:  npm run db:seed
 * No lo ejecutes contra tu base de producción.
 */
import { randomBytes } from "node:crypto";
import { connect } from "./connect";
import * as t from "../src/db/schema";
import { addMonths, addDays, todayISO } from "../src/lib/dates";
import { periodsDueUntil, totalPeriods } from "../src/lib/schedule";

async function main() {
  if (process.env.DATABASE_URL && !process.argv.includes("--force")) {
    console.error("DATABASE_URL está configurada. Usa --force si de verdad quieres sembrar datos demo ahí.");
    process.exit(1);
  }
  const { db, close } = connect();
  const today = todayISO();
  const tok = () => randomBytes(18).toString("base64url");

  const existing = await db.select().from(t.participants);
  if (existing.length) {
    console.log("Ya hay datos; no se siembra nada.");
    await close();
    return;
  }

  const [spotify, youtube, meli] = await db
    .insert(t.services)
    .values([
      { name: "Spotify Familiar", monthlyCostCents: 29900, billingDay: 5 },
      { name: "YouTube Premium Familiar", monthlyCostCents: 23900, billingDay: 12 },
      { name: "Meli+", monthlyCostCents: 9900, billingDay: 20 },
    ])
    .returning();

  const [ana, beto, carla, diego] = await db
    .insert(t.participants)
    .values([
      { name: "Ana López", phone: "5215511111111", accessToken: "demo-ana" },
      { name: "Beto Ramírez", phone: "5215522222222", accessToken: tok() },
      { name: "Carla Méndez", phone: "5215533333333", accessToken: "demo-carla" },
      { name: "Diego Torres", phone: "5215544444444", accessToken: tok() },
    ])
    .returning();

  const start3 = addMonths(today, -3);
  const obs = await db
    .insert(t.obligations)
    .values([
      { participantId: ana.id, serviceId: spotify.id, kind: "subscription", direction: "receivable", title: "Spotify Familiar", amountPerPeriodCents: 5000, startDate: start3 },
      { participantId: beto.id, serviceId: spotify.id, kind: "subscription", direction: "receivable", title: "Spotify Familiar", amountPerPeriodCents: 5000, startDate: start3 },
      { participantId: beto.id, serviceId: youtube.id, kind: "subscription", direction: "receivable", title: "YouTube Premium", amountPerPeriodCents: 4000, startDate: addMonths(today, -2) },
      { participantId: ana.id, kind: "installment", direction: "receivable", title: "iPhone 16 a 12 MSI", totalAmountCents: 1899900, periodsTotal: 12, startDate: addMonths(today, -4), lateFeeCents: 10000 },
      { participantId: carla.id, kind: "loan", direction: "payable", title: "Préstamo que me hizo Carla", totalAmountCents: 600000, periodsTotal: 6, startDate: addMonths(today, -1) },
      { participantId: carla.id, serviceId: meli.id, kind: "subscription", direction: "receivable", title: "Meli+", amountPerPeriodCents: 3300, startDate: addMonths(today, -1) },
      { participantId: diego.id, kind: "one_time", direction: "receivable", title: "Boletos del concierto", frequency: "once", totalAmountCents: 180000, periodsTotal: 1, startDate: addDays(today, 2) },
    ])
    .returning();

  for (const o of obs) {
    const total = totalPeriods(o);
    const rows = periodsDueUntil(o, addDays(today, 7)).map((p) => ({
      obligationId: o.id,
      participantId: o.participantId,
      direction: o.direction,
      kind: "regular" as const,
      periodNumber: p.n,
      dueDate: p.due,
      amountCents: p.amount,
      description: total ? `${o.title} · ${p.n}/${total}` : `${o.title} · periodo ${p.n}`,
    }));
    if (rows.length) await db.insert(t.charges).values(rows);
  }

  const approved = { status: "approved" as const, submittedBy: "admin" as const, method: "transfer" as const };
  await db.insert(t.payments).values([
    { ...approved, participantId: ana.id, direction: "receivable", amountCents: 5000 * 3, paidOn: addDays(today, -40), obligationId: obs[0].id },
    { ...approved, participantId: ana.id, direction: "receivable", amountCents: 158325 * 3, paidOn: addDays(today, -20), obligationId: obs[3].id },
    { ...approved, participantId: beto.id, direction: "receivable", amountCents: 9000, paidOn: addDays(today, -35) },
    { ...approved, participantId: carla.id, direction: "payable", amountCents: 100000, paidOn: addDays(today, -25), obligationId: obs[4].id },
    { participantId: beto.id, direction: "receivable", amountCents: 9000, paidOn: addDays(today, -1), status: "pending", submittedBy: "participant", method: "transfer", reference: "SPEI 123456" },
  ]);

  await db.insert(t.settings).values([
    { key: "owner_name", value: "Luis" },
    { key: "payment_instructions", value: "Banco: (tu banco)\nCLABE: 000000000000000000\nTitular: (tu nombre)\nConcepto: tu nombre" },
  ]);

  console.log("Datos demo creados. Portal de Ana: http://localhost:3000/p/demo-ana  · Carla: /p/demo-carla");
  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
