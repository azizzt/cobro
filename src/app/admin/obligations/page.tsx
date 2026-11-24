import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, t } from "@/db";
import { loadAllLedgers } from "@/lib/data";
import { money } from "@/lib/money";
import { relativeDue } from "@/lib/dates";
import { expectedTotal, totalPeriods } from "@/lib/schedule";
import { Badge, Card, DirectionBadge, Empty, Flash, KIND_LABEL, PageHeader, Progress, STATUS_LABEL } from "@/components/ui";

const FILTERS = [
  ["active", "Activas"],
  ["receivable", "Me deben"],
  ["payable", "Debo"],
  ["completed", "Terminadas"],
  ["all", "Todas"],
] as const;

export default async function ObligationsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const f = sp.f ?? "active";
  const [{ participants, ledgers, today }, obligations] = await Promise.all([
    loadAllLedgers(),
    db.select().from(t.obligations).orderBy(desc(t.obligations.id)),
  ]);
  const names = new Map(participants.map((p) => [p.id, p.name]));
  const list = obligations.filter((o) => {
    if (f === "active") return o.status === "active" || o.status === "paused";
    if (f === "receivable" || f === "payable") return o.direction === f && o.status !== "cancelled";
    if (f === "completed") return o.status === "completed" || o.status === "cancelled";
    return true;
  });

  return (
    <>
      <PageHeader
        title="Obligaciones"
        subtitle="Suscripciones, compras a MSI, préstamos y cargos únicos"
        actions={
          <Link href="/admin/obligations/new" className="btn-primary">
            Nueva obligación
          </Link>
        }
      />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(([k, l]) => (
          <Link
            key={k}
            href={`/admin/obligations?f=${k}`}
            className={`rounded-full px-3 py-1 text-sm ${f === k ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
          >
            {l}
          </Link>
        ))}
      </div>
      <Card>
        {list.length === 0 ? (
          <Empty>No hay obligaciones en esta vista.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Persona</th>
                  <th>Tipo</th>
                  <th className="w-40">Progreso</th>
                  <th className="text-right">Pendiente</th>
                  <th>Próximo</th>
                </tr>
              </thead>
              <tbody>
                {list.map((o) => {
                  const st = ledgers.get(o.participantId)?.obligations.get(o.id);
                  const periods = totalPeriods(o);
                  const [sl, stone] = STATUS_LABEL[o.status];
                  return (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/admin/obligations/${o.id}`} className="font-medium hover:underline">
                          {o.title}
                        </Link>
                        <div className="mt-0.5 flex gap-1">
                          <DirectionBadge direction={o.direction} />
                          {o.status !== "active" && <Badge tone={stone}>{sl}</Badge>}
                        </div>
                      </td>
                      <td>
                        <Link href={`/admin/participants/${o.participantId}`} className="hover:underline">
                          {names.get(o.participantId)}
                        </Link>
                      </td>
                      <td className="text-xs text-slate-600">
                        {KIND_LABEL[o.kind]}
                        <div className="text-slate-400">
                          {o.amountPerPeriodCents ? money(o.amountPerPeriodCents) : money(expectedTotal(o))}
                        </div>
                      </td>
                      <td>
                        {periods ? (
                          <>
                            <div className="mb-1 text-xs">
                              {st?.regularPaid ?? 0}/{periods}
                            </div>
                            <Progress value={st?.regularPaid ?? 0} max={periods} />
                          </>
                        ) : (
                          <span className="text-xs text-slate-500">{st?.regularPaid ?? 0} pagados · recurrente</span>
                        )}
                      </td>
                      <td className={`num text-right ${st?.overdue ? "text-rose-700" : ""}`}>{money(st?.outstanding ?? 0)}</td>
                      <td className="text-xs text-slate-500">{st?.nextDue ? relativeDue(st.nextDue, today) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
