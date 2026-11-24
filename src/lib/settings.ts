import "server-only";
import { db, t } from "@/db";

export const SETTING_DEFAULTS = {
  /** Nombre que verán los participantes */
  owner_name: "Administrador",
  /** Instrucciones de pago visibles en el portal (banco, CLABE, titular…) */
  payment_instructions: "Banco: —\nCLABE: —\nTitular: —\nConcepto: tu nombre",
  /** Días antes del vencimiento para el primer recordatorio */
  remind_days_before: "3",
  /** Cada cuántos días repetir el recordatorio de pagos vencidos */
  overdue_repeat_days: "3",
  /** Días de gracia antes de aplicar recargo (si la obligación lo tiene) */
  late_fee_grace_days: "5",
  /** Días de anticipación con que se generan los cargos (para que aparezcan como "próximos") */
  charge_lead_days: "7",
  /** Recordatorios automáticos activados */
  auto_reminders: "true",
};

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type Settings = Record<SettingKey, string>;

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(t.settings);
  const out = { ...SETTING_DEFAULTS } as Settings;
  for (const r of rows) if (r.key in out) out[r.key as SettingKey] = r.value;
  return out;
}

export async function saveSettings(values: Partial<Settings>) {
  for (const [key, value] of Object.entries(values)) {
    if (value == null) continue;
    await db
      .insert(t.settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: t.settings.key, set: { value } });
  }
}

export const num = (s: string, fallback: number) => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
};
