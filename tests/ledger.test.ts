import { describe, it, expect } from "vitest";
import { computeLedger, type LedgerCharge, type LedgerPayment } from "@/lib/ledger";
import { amountFor, dueDateFor, periodsDueUntil, expectedTotal } from "@/lib/schedule";
import { addMonths, diffDays } from "@/lib/dates";
import { parseMoney } from "@/lib/money";

const ch = (id: number, due: string, amount: number, extra: Partial<LedgerCharge> = {}): LedgerCharge => ({
  id, obligationId: 1, direction: "receivable", dueDate: due, amountCents: amount, kind: "regular", ...extra,
});
const pay = (id: number, amount: number, extra: Partial<LedgerPayment> = {}): LedgerPayment => ({
  id, obligationId: null, direction: "receivable", amountCents: amount, paidOn: "2026-01-01", ...extra,
});

describe("computeLedger", () => {
  it("acumula meses no pagados (saldo arrastrado)", () => {
    const l = computeLedger([ch(1, "2026-01-05", 10000), ch(2, "2026-02-05", 10000)], [], "2026-02-10");
    expect(l.receivable.balance).toBe(20000);
    expect(l.receivable.overdue).toBe(20000);
  });

  it("aplica pagos FIFO y deja parcial", () => {
    const l = computeLedger(
      [ch(1, "2026-01-05", 10000), ch(2, "2026-02-05", 10000)],
      [pay(1, 15000)],
      "2026-02-10",
    );
    expect(l.charges.get(1)!.status).toBe("paid");
    expect(l.charges.get(2)!.status).toBe("partial");
    expect(l.receivable.balance).toBe(5000);
    expect(l.obligations.get(1)!.regularPaid).toBe(1);
  });

  it("pago de más genera saldo a favor", () => {
    const l = computeLedger([ch(1, "2026-01-05", 10000)], [pay(1, 13000)], "2026-01-10");
    expect(l.receivable.credit).toBe(3000);
    expect(l.receivable.balance).toBe(-3000);
  });

  it("pago ligado se aplica primero a su obligación", () => {
    const l = computeLedger(
      [ch(1, "2026-01-05", 10000, { obligationId: 1 }), ch(2, "2026-02-05", 5000, { obligationId: 2 })],
      [pay(1, 5000, { obligationId: 2 })],
      "2026-03-01",
    );
    expect(l.charges.get(2)!.status).toBe("paid");
    expect(l.charges.get(1)!.status).toBe("unpaid");
  });

  it("calcula neto en ambos sentidos", () => {
    const l = computeLedger(
      [ch(1, "2026-01-05", 10000), ch(2, "2026-01-05", 30000, { direction: "payable", obligationId: 9 })],
      [],
      "2026-01-01",
    );
    expect(l.receivable.balance).toBe(10000);
    expect(l.payable.balance).toBe(30000);
    expect(l.net).toBe(-20000);
    expect(l.receivable.overdue).toBe(0);
  });
});

describe("schedule", () => {
  const msi = {
    frequency: "monthly" as const, startDate: "2026-01-31", endDate: null,
    periodsTotal: 3, totalAmountCents: 100000, amountPerPeriodCents: null,
  };
  it("reparte MSI con residuo al final", () => {
    expect([1, 2, 3].map((n) => amountFor(msi, n))).toEqual([33333, 33333, 33334]);
    expect(expectedTotal(msi)).toBe(100000);
  });
  it("respeta fin de mes", () => {
    expect(dueDateFor(msi, 2)).toBe("2026-02-28");
    expect(dueDateFor(msi, 3)).toBe("2026-03-31");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });
  it("genera solo hasta la fecha y no más del total", () => {
    expect(periodsDueUntil(msi, "2026-02-28").length).toBe(2);
    expect(periodsDueUntil(msi, "2030-01-01").length).toBe(3);
  });
  it("utilidades", () => {
    expect(diffDays("2026-01-01", "2026-03-01")).toBe(59);
    expect(parseMoney("1,299.5")).toBe(129950);
    expect(Number.isNaN(parseMoney("abc"))).toBe(true);
  });
});
