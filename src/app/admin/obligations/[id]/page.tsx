import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, t } from "@/db";
import { loadParticipantAccount } from "@/lib/data";
import { centsToInput, money } from "@/lib/money";
import { fmtDate, todayISO } from "@/lib/dates";
import { amountFor, dueDateFor, expectedTotal, totalPeriods } from "@/lib/schedule";
import {
  Badge,
  Card,
  ChargeStatusBadge,
  DirectionBadge,
  Field,
  Flash,
  FREQ_LABEL,
  KIND_LABEL,
  PageHeader,
  Progress,
  STATUS_LABEL,
  Stat,
} from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { addAdjustment, deleteCharge, deleteObligation, saveObligation, setObligationStatus } from "../../actions";
import { ObligationForm } from "../form";
import { PaymentItem } from "../../shared";

export default async function ObligationDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const [o] = await db.select().from(t.obligations).where(eq(t.obligations.id, id));
  if (!o) notFound();
  const [acc, participants, services, [person]] = await Promise.all([
    loadParticipantAccount(o.participantId),
    db.select({ id: t.participants.id, name: t.participants.name }).from(t.participants).orderBy(asc(t.participants.name)),
    db.select({ id: t.services.id, name: t.services.name }).from(t.services),
    db.select().from(t.participants).where(eq(t.participants.id, o.participantId)),
  ]);
  const st = acc.ledger.obligations.get(id);
  const charges = acc.charges.filter((c) => c.obligationId === id);
  const payments = acc.payments.filter((p) => p.obligationId === id);
  const periods = totalPeriods(o);
  const total = expectedTotal(o);
  const generated = new Set(charges.filter((c) => c.kind === "regular").map((c) => c.periodNumber));

  // Proyección de periodos futuros aún no generados
  const projection: { n: number; due: string; amount: number }[] = [];
  const maxN = periods ?? (Math.max(0, ...[...generated].map((n) => n ?? 0)) + 6);
  for (let n = 1; n <= maxN && projection.length < 24; n++) {
    if (generated.has(n)) continue;
    const due = dueDateFor(o, n);
    if (o.endDate && due > o.endDate) break;
    projection.push({ n, due, amount: amountFor(o, n) });
  }
  const [sl, stone] = STATUS_LABEL[o.status];
  const back = `/admin/obligations/${id}`;

  return (
    <>
      <PageHeader
        title={o.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <Link href={`/admin/participants/${o.participantId}`} className="font-medium text-brand-600 hover:underline">
              {person?.name}
            </Link>
            · {KIND_LABEL[o.kind]} · {FREQ_LABEL[o.frequency]} <DirectionBadge direction={o.direction} />
            <Badge tone={stone}>{sl}</Badge>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {o.status === "active" && (
              <form action={setObligationStatus.bind(null, id, "paused")}>
                <SubmitButton className="btn-secondary">Pausar</SubmitButton>
              </form>
            )}
            {(o.status === "paused" || o.status === "completed" || o.status === "cancelled") && (
              <form action={setObligationStatus.bind(null, id, "active")}>
                <SubmitButton className="btn-secondary">Reactivar</SubmitButton>
              </form>
            )}
            {o.status !== "cancelled" && (
              <form action={setObligationStatus.bind(null, id, "cancelled")}>
                <SubmitButton className="btn-secondary" confirm="No se generarán más cargos. Lo ya generado sigue pendiente. ¿Cancelar?">
                  Cancelar
                </SubmitButton>
              </form>
            )}
            <form action={deleteObligation.bind(null, id)}>
              <SubmitButton className="btn-danger" confirm="Se borrarán la obligación y sus cargos (los pagos quedan como saldo a favor). ¿Eliminar?">
                Eliminar
              </SubmitButton>
            </form>
          </div>
        }
      />
      <Flash {...sp} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total" value={total != null ? money(total) : "Recurrente"} hint={o.amountPerPeriodCents ? `${money(o.amountPerPeriodCents)} por periodo` : undefined} />
        <Stat label="Pagado" value={money(st?.paid ?? 0)} tone="green" />
        <Stat label="Pendiente" value={money(st?.outstanding ?? 0)} tone={st?.overdue ? "red" : "slate"} hint={st?.overdue ? `${money(st.overdue)} vencido` : undefined} />
        <Stat
          label="Pagos"
          value={periods ? `${st?.regularPaid ?? 0} / ${periods}` : `${st?.regularPaid ?? 0}`}
          hint={periods ? <Progress value={st?.regularPaid ?? 0} max={periods} /> : "periodos pagados"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Calendario">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Vence</th>
                    <th>Concepto</th>
                    <th className="text-right">Monto</th>
                    <th className="text-right">Pagado</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {charges.map((c) => {
                    const cs = acc.ledger.charges.get(c.id)!;
                    return (
                      <tr key={c.id}>
                        <td className="text-xs text-slate-500">{c.periodNumber ?? "—"}</td>
                        <td className="whitespace-nowrap text-xs">{fmtDate(c.dueDate)}</td>
                        <td>
                          {c.description}
                          {c.kind !== "regular" && (
                            <form action={deleteCharge.bind(null, c.id, id)} className="inline">
                              <SubmitButton className="ml-2 text-xs text-slate-400 hover:text-rose-600" confirm="¿Quitar este cargo?" pendingText="…">
                                quitar
                              </SubmitButton>
                            </form>
                          )}
                        </td>
                        <td className="num text-right">{money(c.amountCents)}</td>
                        <td className="num text-right text-slate-500">{money(cs.paid)}</td>
                        <td>
                          <ChargeStatusBadge status={cs.status} overdue={cs.overdue} dueToday={c.dueDate === acc.today} />
                        </td>
                      </tr>
                    );
                  })}
                  {o.status === "active" &&
                    projection.map((p) => (
                      <tr key={`p${p.n}`} className="text-slate-400">
                        <td className="text-xs">{p.n}</td>
                        <td className="whitespace-nowrap text-xs">{fmtDate(p.due)}</td>
                        <td className="text-xs italic">programado</td>
                        <td className="num text-right">{money(p.amount)}</td>
                        <td />
                        <td>
                          <Badge>Futuro</Badge>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Los cargos se generan automáticamente unos días antes de su vencimiento. Los pagos se aplican primero a esta obligación si se ligan a ella; si no, a lo más antiguo.
            </p>
          </Card>

          <Card title="Pagos ligados a esta obligación">
            {payments.length === 0 ? (
              <p className="text-sm text-slate-500">Ninguno (los pagos generales también se aplican aquí si es lo más antiguo).</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <PaymentItem key={p.id} pay={p} back={back} />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Agregar cargo extra">
            <form action={addAdjustment.bind(null, id)} className="space-y-3">
              <Field label="Monto (MXN)">
                <input name="amount" inputMode="decimal" required className="input" />
              </Field>
              <Field label="Fecha">
                <input name="dueDate" type="date" defaultValue={todayISO()} className="input" />
              </Field>
              <Field label="Descripción">
                <input name="description" className="input" placeholder="Aumento de precio, gasto extra…" />
              </Field>
              <SubmitButton className="btn-secondary">Agregar cargo</SubmitButton>
            </form>
            <p className="mt-2 text-xs text-slate-500">
              Para descuentos o perdonar parte de la deuda registra un pago con método “Condonación”.
            </p>
          </Card>
        </div>
      </div>

      <Card title="Editar" className="mt-6">
        <p className="mb-3 text-xs text-amber-700">
          Al guardar se recalcula el calendario completo; los pagos ya registrados se vuelven a aplicar automáticamente.
        </p>
        <ObligationForm
          action={saveObligation.bind(null, id)}
          participants={participants}
          services={services}
          defaults={{
            participantId: o.participantId,
            serviceId: o.serviceId,
            kind: o.kind,
            direction: o.direction,
            title: o.title,
            description: o.description,
            frequency: o.frequency,
            amountPerPeriod: centsToInput(o.amountPerPeriodCents),
            totalAmount: centsToInput(o.totalAmountCents),
            periodsTotal: o.periodsTotal,
            startDate: o.startDate,
            endDate: o.endDate,
            lateFee: o.lateFeeCents ? centsToInput(o.lateFeeCents) : "",
          }}
          submitLabel="Guardar cambios"
        />
      </Card>
    </>
  );
}
