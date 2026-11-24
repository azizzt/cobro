import Link from "next/link";
import type { Account } from "@/lib/data";
import type { Obligation } from "@/db/schema";
import { money } from "@/lib/money";
import { fmtDate, relativeDue } from "@/lib/dates";
import { expectedTotal, totalPeriods } from "@/lib/schedule";
import { Badge, ChargeStatusBadge, DirectionBadge, Empty, FREQ_LABEL, KIND_LABEL, Progress, STATUS_LABEL } from "./ui";

/** Tarjetas de progreso por obligación (x de N pagos). */
export function ObligationProgress({
  acc,
  linkBase,
  perspective = "admin",
}: {
  acc: Account;
  linkBase?: string;
  perspective?: "admin" | "participant";
}) {
  const visible = acc.obligations.filter((o) => o.status !== "cancelled" || (acc.ledger.obligations.get(o.id)?.outstanding ?? 0) > 0);
  if (!visible.length) return <Empty>Sin obligaciones registradas.</Empty>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {visible.map((o) => (
        <ObligationCard key={o.id} o={o} acc={acc} href={linkBase ? `${linkBase}/${o.id}` : undefined} perspective={perspective} />
      ))}
    </div>
  );
}

function ObligationCard({
  o,
  acc,
  href,
  perspective,
}: {
  o: Obligation;
  acc: Account;
  href?: string;
  perspective: "admin" | "participant";
}) {
  const st = acc.ledger.obligations.get(o.id);
  const periods = totalPeriods(o);
  const total = expectedTotal(o);
  const paidCount = st?.regularPaid ?? 0;
  const [statusLabel, statusTone] = STATUS_LABEL[o.status];
  // Desde la vista del participante, "receivable" significa "tú debes"
  const dirBadge =
    perspective === "participant" ? (
      o.direction === "receivable" ? <Badge tone="amber">Tú pagas</Badge> : <Badge tone="green">Te pagan</Badge>
    ) : (
      <DirectionBadge direction={o.direction} />
    );

  const title = href ? (
    <Link href={href} className="font-medium hover:underline">
      {o.title}
    </Link>
  ) : (
    <span className="font-medium">{o.title}</span>
  );

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {title}
        {dirBadge}
        {o.status !== "active" && <Badge tone={statusTone}>{statusLabel}</Badge>}
      </div>
      <div className="mt-0.5 text-xs text-slate-500">
        {KIND_LABEL[o.kind]} · {FREQ_LABEL[o.frequency]}
        {o.amountPerPeriodCents ? ` · ${money(o.amountPerPeriodCents)} c/u` : ""}
        {total != null ? ` · total ${money(total)}` : ""}
      </div>
      {periods ? (
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-xs">
            <span>
              <strong>{paidCount}</strong> de {periods} pagos
            </span>
            <span className="text-slate-500">
              {periods - paidCount > 0 ? `faltan ${periods - paidCount}` : "¡completado!"}
            </span>
          </div>
          <Progress value={paidCount} max={periods} tone={paidCount >= periods ? "green" : "blue"} />
          {total != null && (
            <div className="text-xs text-slate-500">
              Pagado {money(st?.paid ?? 0)} de {money(total)}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2 text-xs text-slate-500">
          {paidCount} periodo(s) pagados · recurrente
        </div>
      )}
      {st && st.outstanding > 0 && (
        <div className={`mt-2 text-sm ${st.overdue > 0 ? "text-rose-700" : "text-slate-700"}`}>
          Pendiente <strong className="num">{money(st.outstanding)}</strong>
          {st.nextDue && <span className="text-xs"> · {relativeDue(st.nextDue, acc.today)}</span>}
        </div>
      )}
    </div>
  );
}

/** Estado de cuenta: cada cargo con lo pagado y lo pendiente. */
export function StatementTable({
  acc,
  direction,
  limit,
  perspective = "admin",
}: {
  acc: Account;
  direction?: "receivable" | "payable";
  limit?: number;
  perspective?: "admin" | "participant";
}) {
  let rows = acc.charges.filter((c) => !direction || c.direction === direction).slice().reverse();
  if (limit) rows = rows.slice(0, limit);
  if (!rows.length) return <Empty>Sin cargos todavía.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Vence</th>
            <th>Concepto</th>
            <th className="text-right">Monto</th>
            <th className="text-right">Pagado</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const st = acc.ledger.charges.get(c.id)!;
            return (
              <tr key={c.id}>
                <td className="whitespace-nowrap text-xs">{fmtDate(c.dueDate)}</td>
                <td>
                  {c.description}
                  {!direction && (
                    <span className="ml-1">
                      {perspective === "participant" ? (
                        c.direction === "receivable" ? <Badge tone="amber">Tú pagas</Badge> : <Badge tone="green">Te pagan</Badge>
                      ) : (
                        <DirectionBadge direction={c.direction} />
                      )}
                    </span>
                  )}
                  {c.kind === "late_fee" && <span className="ml-1"><Badge tone="red">Recargo</Badge></span>}
                  {c.kind === "adjustment" && <span className="ml-1"><Badge tone="violet">Extra</Badge></span>}
                </td>
                <td className="num text-right">{money(c.amountCents)}</td>
                <td className="num text-right text-slate-500">{money(st.paid)}</td>
                <td>
                  <ChargeStatusBadge status={st.status} overdue={st.overdue} dueToday={c.dueDate === acc.today} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
