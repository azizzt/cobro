import { getSettings } from "@/lib/settings";
import { emailEnabled, whatsappApiEnabled, appUrl } from "@/lib/notify";
import { Badge, Card, Field, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { runCronNow, saveSettingsAction } from "../actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const env = [
    ["Base de datos", process.env.DATABASE_URL ? "Postgres en la nube" : "PGlite local (desarrollo)", !!process.env.DATABASE_URL],
    ["URL pública", appUrl(), !!process.env.APP_URL],
    ["Secreto de sesión", process.env.SESSION_SECRET ? "configurado" : "falta (usa uno de desarrollo)", !!process.env.SESSION_SECRET],
    ["Secreto del cron", process.env.CRON_SECRET ? "configurado" : "falta", !!process.env.CRON_SECRET],
    ["Correo SMTP", emailEnabled() ? "activo" : "no configurado", emailEnabled()],
    ["WhatsApp Cloud API", whatsappApiEnabled() ? "activa" : "no configurada (se usan enlaces wa.me)", whatsappApiEnabled()],
    ["Avisos CallMeBot", process.env.CALLMEBOT_APIKEY ? "activo" : "no configurado", !!process.env.CALLMEBOT_APIKEY],
  ] as const;

  return (
    <>
      <PageHeader title="Ajustes" />
      <Flash {...sp} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Preferencias" className="lg:col-span-2">
          <form action={saveSettingsAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="Tu nombre (lo ven los participantes)">
              <input name="owner_name" defaultValue={s.owner_name} className="input" />
            </Field>
            <div />
            <Field label="Datos para pagarte (visibles en el portal)" className="sm:col-span-2">
              <textarea name="payment_instructions" rows={4} defaultValue={s.payment_instructions} className="input font-mono" />
            </Field>
            <Field label="Recordar N días antes del vencimiento">
              <input name="remind_days_before" type="number" min={0} max={30} defaultValue={s.remind_days_before} className="input" />
            </Field>
            <Field label="Repetir recordatorio de vencidos cada N días">
              <input name="overdue_repeat_days" type="number" min={1} max={30} defaultValue={s.overdue_repeat_days} className="input" />
            </Field>
            <Field label="Días de gracia antes del recargo">
              <input name="late_fee_grace_days" type="number" min={0} max={60} defaultValue={s.late_fee_grace_days} className="input" />
            </Field>
            <Field label="Generar cargos con N días de anticipación">
              <input name="charge_lead_days" type="number" min={0} max={31} defaultValue={s.charge_lead_days} className="input" />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="auto_reminders" defaultChecked={s.auto_reminders === "true"} /> Recordatorios automáticos activados
            </label>
            <div className="sm:col-span-2">
              <SubmitButton>Guardar</SubmitButton>
            </div>
          </form>
        </Card>

        <div className="space-y-6">
          <Card title="Proceso diario">
            <p className="text-sm text-slate-600">
              Se ejecuta solo una vez al día (cron). Genera cargos, aplica recargos, cierra obligaciones terminadas y crea recordatorios.
            </p>
            <form action={runCronNow} className="mt-3 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="withReminders" /> Incluir recordatorios y resumen
              </label>
              <SubmitButton className="btn-secondary" pendingText="Ejecutando…">
                Ejecutar ahora
              </SubmitButton>
            </form>
          </Card>

          <Card title="Respaldo">
            <p className="text-sm text-slate-600">Descarga toda la información (sin archivos de comprobantes).</p>
            <div className="mt-3 flex gap-2">
              <a href="/api/export?format=json" className="btn-secondary btn-sm">
                JSON
              </a>
              <a href="/api/export?format=csv" className="btn-secondary btn-sm">
                CSV de movimientos
              </a>
            </div>
          </Card>

          <Card title="Configuración del servidor">
            <ul className="space-y-1.5 text-sm">
              {env.map(([k, v, ok]) => (
                <li key={k} className="flex items-center justify-between gap-2">
                  <span className="text-slate-600">{k}</span>
                  <Badge tone={ok ? "green" : "slate"}>{v}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">Se cambia con variables de entorno (ver .env.example).</p>
          </Card>
        </div>
      </div>
    </>
  );
}
