import { addDays, addMonths } from "./dates";
import type { Obligation } from "@/db/schema";

type ScheduleInput = Pick<
  Obligation,
  "frequency" | "startDate" | "endDate" | "periodsTotal" | "totalAmountCents" | "amountPerPeriodCents"
>;

/** Número total de periodos o null si es indefinido. */
export function totalPeriods(o: ScheduleInput): number | null {
  if (o.frequency === "once") return 1;
  return o.periodsTotal ?? null;
}

/** Fecha de vencimiento del periodo n (1-based). */
export function dueDateFor(o: ScheduleInput, n: number): string {
  switch (o.frequency) {
    case "monthly":
      return addMonths(o.startDate, n - 1);
    case "biweekly":
      return addDays(o.startDate, 14 * (n - 1));
    case "weekly":
      return addDays(o.startDate, 7 * (n - 1));
    case "once":
      return o.startDate;
  }
}

/**
 * Monto del periodo n. Si hay total + periodos (MSI/préstamo) se reparte el
 * total y el residuo de centavos se suma al último periodo.
 */
export function amountFor(o: ScheduleInput, n: number): number {
  const periods = totalPeriods(o);
  if (o.totalAmountCents != null && periods) {
    const base = Math.floor(o.totalAmountCents / periods);
    return n === periods ? o.totalAmountCents - base * (periods - 1) : base;
  }
  return o.amountPerPeriodCents ?? 0;
}

/** Periodos cuyo vencimiento es <= `until` (respetando total y fecha fin). */
export function periodsDueUntil(o: ScheduleInput, until: string): { n: number; due: string; amount: number }[] {
  const out: { n: number; due: string; amount: number }[] = [];
  const max = totalPeriods(o) ?? Infinity;
  for (let n = 1; n <= max && n <= 1000; n++) {
    const due = dueDateFor(o, n);
    if (due > until) break;
    if (o.endDate && due > o.endDate) break;
    out.push({ n, due, amount: amountFor(o, n) });
  }
  return out;
}

/** Monto total esperado de la obligación (null si es indefinida). */
export function expectedTotal(o: ScheduleInput): number | null {
  const periods = totalPeriods(o);
  if (!periods) return null;
  if (o.totalAmountCents != null) return o.totalAmountCents;
  return (o.amountPerPeriodCents ?? 0) * periods;
}
