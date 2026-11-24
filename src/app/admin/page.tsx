import Link from "next/link";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, t } from "@/db";
import { loadAllLedgers } from "@/lib/data";
import { money } from "@/lib/money";
import { diffDays, fmtDate, relativeDue } from "@/lib/dates";
import { Balance, Badge, Card, DirectionBadge, Empty, Flash, PageHeader, Stat } from "@/components/ui";
import { PaymentItem, ReminderItem } from "./shared";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { participants, charges, ledgers, today } = await loadAllLedgers();
  const monthStart = today.slice(0, 8) + "01";

  const [pendingPays, pendingRems, monthPays, obligations, services] = await Promise.all([
    db.select().from(t.payments).where(eq(t.payments.status, "pending")).orderBy(desc(t.payments.createdAt)),
    db.select().from(t.reminders).where(eq(t.reminders.status, "pending")).orderBy(desc(t.reminders.createdAt)),
    db.select().from(t.payments).where(and(eq(t.payments.status, "approved"), gte(t.payments.paidOn, monthStart))),
    db.select().from(t.obligations),
    db.select().from(t.services).where(eq(t.services.active, true)),
  ]);

  const byId = new Map(participants.map((p) => [p.id, p]));
  const obById = new Map(obligations.map((o) => [o.id, o]));

  let receivable = 0,
    payable = 0,
    overdue = 0;
  for (const l of ledgers.values()) {
    receivable += Math.max(0, l.receivable.balance);
    payable += Math.max(0, l.payable.balance);
    overdue += l.receivable.overdue;
  }
  const collected = monthPays
    .filter((p) => p.direction === "receivable" && p.method !== "offset" && p.method !== "waiver")
    .reduce((s, p) => s + p.amountCents, 0);

  // Plataformas: lo que me cuestan vs lo que recupero al mes
  const platformCost = services.reduce((s, x) => s + x.monthlyCostCents, 0);
  const platformRecovered = obligations
    .filter((o) => o.status === "active" && o.kind === "subscription" && o.serviceId && o.frequency === "monthly")
    .reduce((s, o) => s + (o.amountPerPeriodCents ?? 0), 0);

  // Próximos 14 días y vencidos (ambos sentidos)
  const upcoming = charges
    .map((c) => ({ c, st: ledgers.get(c.participantId)!.charges.get(c.id)! }))
    .filter(({ c, st }) => st.remaining > 0 && diffDays(today, c.dueDate) <= 14)
    .sort((a, b) => (a.c.dueDate < b.c.dueDate ? -1 : 1))
    .slice(0, 15);

  const rows = participants
    .map((p) => ({ p, l: ledgers.get(p.id)! }))
    .filter(({ p, l }) => p.active || l.receivable.balance !== 0 || l.payable.balance !== 0);

  return (
    <>
      <PageHeader
        title="Resumen"
        subtitle={`Hoy es ${fmtDate(today)}`}
        actions={
          <>
            <Link href="/admin/payments#registrar" className="btn-secondary">
              Registrar pago
            </Link>
            <Link href="/admin/obligations/new" className="btn-primary">
              Nueva obligación
            </Link>
          </>
        }
      />
      <Flash {...sp} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Me deben" value={money(receivable)} tone="green" />
        <Stat label="Yo debo" value={money(payable)} tone="red" />
        <Stat
          label="Neto"
          value={<Balance cents={receivable - payable} />}
          hint={receivable - payable >= 0 ? "a mi favor" : "en mi contra"}
        />
        <Stat label="Vencido" value={money(overdue)} tone={overdue ? "amber" : "slate"} />
        <Stat label="Cobrado este mes" value={money(collected)} tone="blue" />
      </div>

      {services.length > 0 && (
        <div className="mt-3 card flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="font-medium text-slate-700">Plataformas</span>
          <span>
            Me cuestan <strong className="num">{money(platformCost)}</strong>/mes
          </span>
          <span>
            Recupero <strong className="num">{money(platformRecovered)}</strong>/mes
          </span>
          <span>
            Mi parte real{" "}
            <strong className="num">{money(Math.max(0, platformCost - platformRecovered))}</strong>/mes
          </span>
          <Link href="/admin/services" className="ml-auto text-brand-600 hover:underline">
            Ver detalle
          </Link>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Saldos por persona" actions={<Link href="/admin/participants" className="text-sm text-brand-600 hover:underline">Ver todos</Link>}>
            {rows.length === 0 ? (
              <Empty>
                Aún no hay personas. <Link href="/admin/participants" className="text-brand-600 underline">Agrega la primera</Link>.
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Persona</th>
                      <th className="text-right">Me debe</th>
                      <th className="text-right">Le debo</th>
                      <th className="text-right">Neto</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ p, l }) => (
                      <tr key={p.id}>
                        <td>
                          <Link href={`/admin/participants/${p.id}`} className="font-medium hover:underline">
                            {p.name}
                          </Link>
                        </td>
                        <td className="num text-right">{money(l.receivable.balance)}</td>
                        <td className="num text-right">{money(l.payable.balance)}</td>
                        <td className="text-right">
                          <Balance cents={l.net} />
                        </td>
                        <td>
                          {l.receivable.overdue > 0 ? (
                            <Badge tone="red">Vencido {money(l.receivable.overdue)}</Badge>
                          ) : l.receivable.balance > 0 ? (
                            <Badge tone="amber">Pendiente</Badge>
                          ) : (
                            <Badge tone="green">Al corriente</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Próximos vencimientos (14 días) y atrasos">
            {upcoming.length === 0 ? (
              <Empty>Nada pendiente en los próximos días 🎉</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcoming.map(({ c, st }) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <DirectionBadge direction={c.direction} />
                    <Link href={`/admin/participants/${c.participantId}`} className="font-medium hover:underline">
                      {byId.get(c.participantId)?.name}
                    </Link>
                    <span className="text-slate-600">{c.description}</span>
                    <span className="ml-auto num font-medium">{money(st.remaining)}</span>
                    <span className={`text-xs ${st.overdue ? "text-rose-600" : "text-slate-500"}`}>
                      {relativeDue(c.dueDate, today)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={`Comprobantes por revisar (${pendingPays.length})`}>
            {pendingPays.length === 0 ? (
              <Empty>Sin pendientes</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pendingPays.map((p) => (
                  <PaymentItem
                    key={p.id}
                    pay={p}
                    participant={byId.get(p.participantId)}
                    obligation={p.obligationId ? obById.get(p.obligationId) : undefined}
                    back="/admin"
                  />
                ))}
              </ul>
            )}
          </Card>

          <Card
            title={`Recordatorios por enviar (${pendingRems.length})`}
            actions={<Link href="/admin/reminders" className="text-sm text-brand-600 hover:underline">Historial</Link>}
          >
            {pendingRems.length === 0 ? (
              <Empty>No hay recordatorios en cola</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pendingRems.map((r) => (
                  <ReminderItem key={r.id} r={r} p={byId.get(r.participantId)} back="/admin" />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
