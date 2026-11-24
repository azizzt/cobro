const fmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

/** 29900 → "$299.00" */
export function money(cents: number | null | undefined): string {
  return fmt.format((cents ?? 0) / 100);
}

/** "1,299.50" | "1299.5" | "$1299" → 129950. Devuelve NaN si no es válido. */
export function parseMoney(input: FormDataEntryValue | string | null | undefined): number {
  if (input == null) return NaN;
  const s = String(input).replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100);
}

/** 129950 → "1299.50" (para inputs) */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}
