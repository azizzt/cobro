import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, t } from "@/db";
import { loadAllLedgers, loadParticipantAccount, participantById } from "@/lib/data";
import { money } from "@/lib/money";
import { fmtDateTime } from "@/lib/dates";
import { portalLink, waLink } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import { buildReminderText } from "@/lib/jobs";
import { Balance, Card, Field, Flash, PageHeader, Stat } from "@/components/ui";
import { ObligationProgress, StatementTable } from "@/components/account";
import { CopyButton, SubmitButton, WhatsAppSendButton } from "@/components/client";
import {
  deleteParticipant,
  offsetBalances,
  regenerateLink,
  sendManualReminder,
  toggleParticipant,
  updateParticipant,
} from "../../actions";
import { PaymentForm, PaymentItem, ReminderItem } from "../../shared";

export default async function ParticipantDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const p = await participantById(id);
  if (!p) notFound();
  const [acc, reminders, settings, all] = await Promise.all([
    loadParticipantAccount(id),
    db.select().from(t.reminders).where(eq(t.reminders.participantId, id)).orderBy(desc(t.reminders.createdAt)).limit(15),
    getSettings(),
    loadAllLedgers(),
  ]);
  const { ledger } = acc;
  const back = `/admin/participants/${id}`;
  const link = portalLink(p.accessToken);
  const welcome = `Hola ${p.name.split(" ")[0]} 👋, este es tu enlace personal para consultar tu estado de cuenta conmigo, ver tus pagos y subir comprobantes: ${link}\n(Guárdalo, es solo para ti.)`;
  const welcomeLink = waLink(p.phone, welcome);
  const statementLink = waLink(p.phone, buildReminderText(p, acc, "manual", settings));
  const obById = new Map(acc.obligations.map((o) => [o.id, o]));
  const canOffset = ledger.receivable.balance > 0 && ledger.payable.balance > 0;

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={
          <>
            {p.phone ? `+${p.phone}` : "Sin WhatsApp"} {p.email ? ` · ${p.email}` : ""} · Último acceso:{" "}
            {p.lastSeenAt ? fmtDateTime(p.lastSeenAt) : "nunca"}
            {!p.active && " · INACTIVO"}
          </>
        }
        actions={
          <>
            <Link href={`/admin/obligations/new?participant=${id}`} className="btn-primary">
              Nueva obligación
            </Link>
          </>
        }
      />
      <Flash {...sp} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Me debe" value={money(ledger.receivable.balance)} tone="green" hint={ledger.receivable.overdue ? `${money(ledger.receivable.overdue)} vencido` : undefined} />
        <Stat label="Le debo" value={money(ledger.payable.balance)} tone="red" hint={ledger.payable.overdue ? `${money(ledger.payable.overdue)} vencido` : undefined} />
        <Stat label="Neto" value={<Balance cents={ledger.net} />} hint={ledger.net >= 0 ? "a mi favor" : "le debo"} />
        <Stat
          label="Saldo a favor"
          value={money(ledger.receivable.credit)}
          hint={ledger.payable.credit ? `Le adelanté ${money(ledger.payable.credit)}` : "pagos adelantados"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Obligaciones">
            <ObligationProgress acc={acc} linkBase="/admin/obligations" />
          </Card>
          <Card title="Estado de cuenta">
            <StatementTable acc={acc} />
          </Card>
          <Card title="Pagos">
            {acc.payments.length === 0 ? (
              <p className="text-sm text-slate-500">Sin pagos registrados.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {acc.payments.map((pay) => (
                  <PaymentItem key={pay.id} pay={pay} obligation={pay.obligationId ? obById.get(pay.obligationId) : undefined} back={back} />
                ))}
              </ul>
            )}
          </Card>
          <Card title="Registrar pago">
            <PaymentForm participants={all.participants} obligations={acc.obligations} back={back} fixedParticipantId={id} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Enlace personal">
            <p className="break-all rounded-lg bg-slate-50 p-2 font-mono text-xs">{link}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <CopyButton text={link} />
              {welcomeLink && <WhatsAppSendButton href={welcomeLink} label="Enviar bienvenida" />}
              <a href={link} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                Ver como participante
              </a>
            </div>
            <form action={regenerateLink.bind(null, id)} className="mt-3">
              <SubmitButton className="btn-danger btn-sm" confirm="El enlace actual dejará de funcionar. ¿Continuar?">
                Regenerar enlace
              </SubmitButton>
            </form>
          </Card>

          <Card title="Recordatorio">
            {statementLink && (
              <div className="mb-3">
                <WhatsAppSendButton href={statementLink} label="Enviar estado de cuenta" />
              </div>
            )}
            <form action={sendManualReminder.bind(null, id, back)} className="space-y-2">
              <textarea
                name="message"
                rows={3}
                className="input"
                placeholder="Mensaje personalizado (vacío = estado de cuenta automático)"
              />
              <SubmitButton className="btn-secondary btn-sm">Crear recordatorio</SubmitButton>
            </form>
            {reminders.length > 0 && (
              <ul className="mt-3 divide-y divide-slate-100">
                {reminders.map((r) => (
                  <ReminderItem key={r.id} r={r} p={p} back={back} />
                ))}
              </ul>
            )}
          </Card>

          {canOffset && (
            <Card title="Compensar saldos">
              <p className="text-sm text-slate-600">
                Me debe {money(ledger.receivable.balance)} y le debo {money(ledger.payable.balance)}. Puedes cancelar{" "}
                <strong>{money(Math.min(ledger.receivable.balance, ledger.payable.balance))}</strong> en ambos sentidos sin mover dinero.
              </p>
              <form action={offsetBalances.bind(null, id)} className="mt-2">
                <SubmitButton className="btn-primary btn-sm" confirm="¿Compensar los saldos?">
                  Compensar
                </SubmitButton>
              </form>
            </Card>
          )}

          <Card title="Datos">
            <form action={updateParticipant.bind(null, id)} className="space-y-3">
              <Field label="Nombre">
                <input name="name" required defaultValue={p.name} className="input" />
              </Field>
              <Field label="WhatsApp">
                <input name="phone" defaultValue={p.phone ?? ""} className="input" />
              </Field>
              <Field label="Correo">
                <input name="email" type="email" defaultValue={p.email ?? ""} className="input" />
              </Field>
              <Field label="Notas">
                <textarea name="notes" rows={2} defaultValue={p.notes ?? ""} className="input" />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="notifyWhatsapp" defaultChecked={p.notifyWhatsapp} /> Recordatorios por WhatsApp
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="notifyEmail" defaultChecked={p.notifyEmail} /> Recordatorios por correo
              </label>
              <SubmitButton>Guardar</SubmitButton>
            </form>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              <form action={toggleParticipant.bind(null, id)}>
                <SubmitButton className="btn-secondary btn-sm">{p.active ? "Desactivar" : "Activar"}</SubmitButton>
              </form>
              <form action={deleteParticipant.bind(null, id)}>
                <SubmitButton
                  className="btn-danger btn-sm"
                  confirm="Se borrará la persona con TODAS sus obligaciones, pagos y recordatorios. ¿Seguro?"
                >
                  Eliminar
                </SubmitButton>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
