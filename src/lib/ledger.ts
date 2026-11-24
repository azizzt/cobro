import type { Direction } from "@/db/schema";

/**
 * Motor de saldos. Función pura: recibe cargos y pagos APROBADOS y aplica los
 * pagos a los cargos (FIFO) para obtener qué está pagado, qué está vencido y
 * el saldo acumulado. Así, si alguien no paga un mes, el adeudo simplemente
 * sigue abierto y se suma al siguiente periodo; si paga de más, queda saldo a
 * favor que cubre los siguientes cargos.
 *
 * Reglas:
 *  1. Cada sentido (me deben / debo) se calcula por separado.
 *  2. Un pago ligado a una obligación se aplica primero a esa obligación.
 *  3. Pagos sin obligación + excedentes → a los cargos más antiguos.
 *  4. Lo que sobra queda como saldo a favor (credit).
 */

export type LedgerCharge = {
  id: number;
  obligationId: number;
  direction: Direction;
  dueDate: string;
  amountCents: number;
  kind: "regular" | "late_fee" | "adjustment";
};

export type LedgerPayment = {
  id: number;
  obligationId: number | null;
  direction: Direction;
  amountCents: number;
  paidOn: string;
};

export type ChargeState = {
  paid: number;
  remaining: number;
  status: "paid" | "partial" | "unpaid";
  overdue: boolean;
};

export type Totals = {
  charged: number;
  paid: number;
  /** Lo pendiente de cargos ya generados */
  outstanding: number;
  /** Parte del pendiente ya vencida */
  overdue: number;
  /** Saldo a favor no aplicado */
  credit: number;
  /** outstanding - credit (negativo = saldo a favor) */
  balance: number;
};

export type ObligationTotals = {
  charged: number;
  paid: number;
  outstanding: number;
  overdue: number;
  regularPaid: number;
  regularCount: number;
  nextDue: string | null;
};

export type Ledger = {
  charges: Map<number, ChargeState>;
  receivable: Totals;
  payable: Totals;
  obligations: Map<number, ObligationTotals>;
  /** + = me deben en neto; − = yo debo en neto */
  net: number;
};

const emptyTotals = (): Totals => ({
  charged: 0,
  paid: 0,
  outstanding: 0,
  overdue: 0,
  credit: 0,
  balance: 0,
});

const byDue = (a: LedgerCharge, b: LedgerCharge) =>
  a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id - b.id;
const byPaid = (a: LedgerPayment, b: LedgerPayment) =>
  a.paidOn < b.paidOn ? -1 : a.paidOn > b.paidOn ? 1 : a.id - b.id;

export function computeLedger(
  charges: LedgerCharge[],
  payments: LedgerPayment[],
  today: string,
): Ledger {
  const remaining = new Map<number, number>();
  for (const c of charges) remaining.set(c.id, c.amountCents);

  const result: Ledger = {
    charges: new Map(),
    receivable: emptyTotals(),
    payable: emptyTotals(),
    obligations: new Map(),
    net: 0,
  };

  for (const dir of ["receivable", "payable"] as const) {
    const cs = charges.filter((c) => c.direction === dir).sort(byDue);
    const ps = payments.filter((p) => p.direction === dir).sort(byPaid);
    let pool = 0;

    const apply = (amount: number, targets: LedgerCharge[]): number => {
      let left = amount;
      for (const c of targets) {
        if (left <= 0) break;
        const r = remaining.get(c.id)!;
        if (r <= 0) continue;
        const take = Math.min(r, left);
        remaining.set(c.id, r - take);
        left -= take;
      }
      return left;
    };

    for (const p of ps) {
      if (p.obligationId != null) {
        pool += apply(
          p.amountCents,
          cs.filter((c) => c.obligationId === p.obligationId),
        );
      } else {
        pool += p.amountCents;
      }
    }
    pool = apply(pool, cs);

    const totals = result[dir];
    totals.paid = ps.reduce((s, p) => s + p.amountCents, 0);
    totals.credit = pool;
    for (const c of cs) {
      const r = remaining.get(c.id)!;
      const paid = c.amountCents - r;
      const overdue = r > 0 && c.dueDate < today;
      result.charges.set(c.id, {
        paid,
        remaining: r,
        status: r === 0 ? "paid" : paid > 0 ? "partial" : "unpaid",
        overdue,
      });
      totals.charged += c.amountCents;
      totals.outstanding += r;
      if (overdue) totals.overdue += r;

      let ob = result.obligations.get(c.obligationId);
      if (!ob) {
        ob = { charged: 0, paid: 0, outstanding: 0, overdue: 0, regularPaid: 0, regularCount: 0, nextDue: null };
        result.obligations.set(c.obligationId, ob);
      }
      ob.charged += c.amountCents;
      ob.paid += paid;
      ob.outstanding += r;
      if (overdue) ob.overdue += r;
      if (c.kind === "regular") {
        ob.regularCount++;
        if (r === 0) ob.regularPaid++;
      }
      if (r > 0 && (ob.nextDue == null || c.dueDate < ob.nextDue)) ob.nextDue = c.dueDate;
    }
    totals.balance = totals.outstanding - totals.credit;
  }

  result.net = result.receivable.balance - result.payable.balance;
  return result;
}
