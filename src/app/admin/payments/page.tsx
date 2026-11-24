import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { db, t } from "@/db";
import { Card, Empty, Flash, PageHeader } from "@/components/ui";
import { PaymentForm, PaymentItem } from "../shared";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const f = sp.f ?? "all";
  const [payments, participants, obligations] = await Promise.all([
    db.select().from(t.payments).orderBy(desc(t.payments.paidOn), desc(t.payments.id)).limit(300),
    db.select().from(t.participants).orderBy(asc(t.participants.name)),
    db.select().from(t.obligations).orderBy(asc(t.obligations.title)),
  ]);
  const pById = new Map(participants.map((p) => [p.id, p]));
  const oById = new Map(obligations.map((o) => [o.id, o]));
  const pending = payments.filter((p) => p.status === "pending");
  const list = payments.filter((p) =>
    f === "receivable" || f === "payable" ? p.direction === f && p.status !== "pending" : p.status !== "pending",
  );

  return (
    <>
      <PageHeader title="Pagos" subtitle="Comprobantes por revisar, historial y registro manual" />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Por revisar (${pending.length})`}>
            {pending.length === 0 ? (
              <Empty>No hay comprobantes pendientes.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pending.map((p) => (
                  <PaymentItem key={p.id} pay={p} participant={pById.get(p.participantId)} obligation={p.obligationId ? oById.get(p.obligationId) : undefined} back="/admin/payments" />
                ))}
              </ul>
            )}
          </Card>
          <Card
            title="Historial"
            actions={
              <div className="flex gap-1 text-xs">
                {[
                  ["all", "Todos"],
                  ["receivable", "Recibidos"],
                  ["payable", "Enviados"],
                ].map(([k, l]) => (
                  <Link key={k} href={`/admin/payments?f=${k}`} className={`rounded-full px-2.5 py-1 ${f === k ? "bg-brand-600 text-white" : "bg-slate-100"}`}>
                    {l}
                  </Link>
                ))}
              </div>
            }
          >
            {list.length === 0 ? (
              <Empty>Sin pagos.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {list.map((p) => (
                  <PaymentItem key={p.id} pay={p} participant={pById.get(p.participantId)} obligation={p.obligationId ? oById.get(p.obligationId) : undefined} back={`/admin/payments?f=${f}`} />
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title="Registrar pago" className="h-fit">
          <div id="registrar" />
          <PaymentForm participants={participants.filter((p) => p.active)} obligations={obligations.filter((o) => o.status !== "cancelled")} back="/admin/payments" />
        </Card>
      </div>
    </>
  );
}
