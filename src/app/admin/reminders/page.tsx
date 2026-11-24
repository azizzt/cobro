import { desc } from "drizzle-orm";
import { db, t } from "@/db";
import { emailEnabled, whatsappApiEnabled } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import { Badge, Card, Empty, Flash, PageHeader } from "@/components/ui";
import { ReminderItem } from "../shared";

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const [reminders, participants, settings] = await Promise.all([
    db.select().from(t.reminders).orderBy(desc(t.reminders.createdAt)).limit(200),
    db.select().from(t.participants),
    getSettings(),
  ]);
  const byId = new Map(participants.map((p) => [p.id, p]));
  const pending = reminders.filter((r) => r.status === "pending");
  const rest = reminders.filter((r) => r.status !== "pending");

  return (
    <>
      <PageHeader title="Recordatorios" subtitle="Automáticos (cron diario) y manuales" />
      <Flash {...sp} />
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Canales:</span>
          <Badge tone={whatsappApiEnabled() ? "green" : "slate"}>WhatsApp API {whatsappApiEnabled() ? "activa" : "no configurada"}</Badge>
          <Badge tone="green">WhatsApp por enlace (siempre)</Badge>
          <Badge tone={emailEnabled() ? "green" : "slate"}>Correo {emailEnabled() ? "activo" : "no configurado"}</Badge>
          <Badge tone="green">Portal (siempre)</Badge>
          <span className="ml-auto text-xs text-slate-500">
            Automáticos: {settings.auto_reminders === "true" ? "sí" : "no"} · {settings.remind_days_before} días antes · vencidos cada{" "}
            {settings.overdue_repeat_days} días
          </span>
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Por enviar (${pending.length})`}>
          {pending.length === 0 ? (
            <Empty>Sin pendientes. Los recordatorios por enlace aparecen aquí para enviarlos con un toque.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.map((r) => (
                <ReminderItem key={r.id} r={r} p={byId.get(r.participantId)} back="/admin/reminders" />
              ))}
            </ul>
          )}
        </Card>
        <Card title="Historial">
          {rest.length === 0 ? (
            <Empty>Sin historial.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rest.map((r) => (
                <ReminderItem key={r.id} r={r} p={byId.get(r.participantId)} back="/admin/reminders" />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
