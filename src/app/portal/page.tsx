import type { Metadata } from "next";
import { and, desc, eq, isNull, gte, or } from "drizzle-orm";
import { db, t } from "@/db";
import { requireParticipant } from "@/lib/auth";
import { loadParticipantAccount } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { centsToInput, money } from "@/lib/money";
import { addDays, fmtDate, fmtDateTime, relativeDue, todayISO } from "@/lib/dates";
import { Badge, Card, Empty, Field, Flash, METHOD_LABEL, PAYMENT_STATUS, REMINDER_TYPE } from "@/components/ui";
import { ObligationProgress, StatementTable } from "@/components/account";
import { CopyButton, EvidenceInput, SubmitButton } from "@/components/client";
import { acknowledgeAll, acknowledgeReminder, confirmReceived, portalLogout, submitPayment } from "./actions";

export const metadata: Metadata = { title: "Mi estado de cuenta" };

export default async function Portal({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const p = await requireParticipant();
  const today = todayISO();
  const [acc, settings, reminders] = await Promise.all([
    loadParticipantAccount(p.id, today),
    getSettings(),
    db
      .select()
      .from(t.reminders)
      .where(
        and(
          eq(t.reminders.participantId, p.id),
          or(isNull(t.reminders.acknowledgedAt), gte(t.reminders.forDate, addDays(today, -30))),
        ),
      )
      .orderBy(desc(t.reminders.createdAt))
      .limit(10),
  ]);
  const { ledger } = acc;
  const owes = ledger.receivable.balance;
  const owed = ledger.payable.balance;
  const owner = settings.owner_name;
  const unacked = reminders.filter((r) => !r.acknowledgedAt && r.status !== "skipped");
  const nextCharge = acc.charges
    .filter((c) => c.direction === "receivable" && (ledger.charges.get(c.id)?.remaining ?? 0) > 0)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];
  const toConfirm = acc.payments.filter((x) => x.direction === "payable" && x.status === "approved" && !x.participantConfirmedAt && x.method !== "offset");
  const receivableObs = acc.obligations.filter((o) => o.direction === "receivable" && o.status !== "cancelled");
  const hasPayable = acc.obligations.some((o) => o.direction === "payable");

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-9 w-9" />
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Hola, {p.name.split(" ")[0]}</h1>
          <p className="text-xs text-slate-500">Tu estado de cuenta con {owner} · {fmtDate(today)}</p>
        </div>
        <form action={portalLogout}>
          <button className="btn-secondary btn-sm">Salir</button>
        </form>
      </header>
      <Flash {...sp} />

      {unacked.length > 0 && (
        <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-amber-900">Avisos nuevos ({unacked.length})</h2>
            {unacked.length > 1 && (
              <form action={acknowledgeAll}>
                <SubmitButton className="btn-secondary btn-sm" pendingText="…">
                  Enterado a todos
                </SubmitButton>
              </form>
            )}
          </div>
          <ul className="space-y-2">
            {unacked.map((r) => (
              <li key={r.id} className="rounded-xl bg-white p-3 text-sm shadow-sm">
                <div className="mb-1 flex items-center gap-2">
                  <Badge tone="amber">{REMINDER_TYPE[r.type]}</Badge>
                  <span className="text-xs text-slate-500">{fmtDateTime(r.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-slate-700">{r.message.replace(/\n?Consulta tu detalle.*$/m, "")}</p>
                <form action={acknowledgeReminder.bind(null, r.id)} className="mt-2">
                  <SubmitButton className="btn-primary btn-sm" pendingText="…">
                    👍 Enterado
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card mb-4 text-center">
        {owes > 0 ? (
          <>
            <div className="text-sm text-slate-500">Tienes pendiente</div>
            <div className="num mt-1 text-4xl font-semibold text-slate-900">{money(owes)}</div>
            {ledger.receivable.overdue > 0 && (
              <div className="mt-2">
                <Badge tone="red">{money(ledger.receivable.overdue)} vencido</Badge>
              </div>
            )}
            {nextCharge && (
              <p className="mt-2 text-sm text-slate-600">
                Próximo: {nextCharge.description} · {relativeDue(nextCharge.dueDate, today)} ({fmtDate(nextCharge.dueDate)})
              </p>
            )}
            <a href="#pagar" className="btn-primary mt-4">
              Ya pagué · subir comprobante
            </a>
          </>
        ) : (
          <>
            <div className="text-4xl">✅</div>
            <div className="mt-1 text-lg font-semibold">¡Estás al corriente!</div>
            {ledger.receivable.credit > 0 && (
              <p className="mt-1 text-sm text-emerald-700">Tienes {money(ledger.receivable.credit)} a tu favor para próximos pagos.</p>
            )}
          </>
        )}
        {owed > 0 && (
          <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            {owner} te debe <strong className="num">{money(owed)}</strong>
            {owes > 0 && (
              <>
                {" "}
                · Neto: {ledger.net > 0 ? `tú debes ${money(ledger.net)}` : `te deben ${money(-ledger.net)}`}
              </>
            )}
          </p>
        )}
      </section>

      {toConfirm.length > 0 && (
        <Card title="Pagos que te hizo — confirma si los recibiste" className="mb-4">
          <ul className="divide-y divide-slate-100">
            {toConfirm.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="num font-semibold">{money(x.amountCents)}</span>
                <span className="text-slate-500">
                  {METHOD_LABEL[x.method]} · {fmtDate(x.paidOn)}
                </span>
                {x.evidenceId && (
                  <a href={`/api/evidence/${x.evidenceId}`} target="_blank" rel="noreferrer" className="text-brand-600 underline">
                    comprobante
                  </a>
                )}
                <form action={confirmReceived.bind(null, x.id)} className="ml-auto">
                  <SubmitButton className="btn-success btn-sm" pendingText="…">
                    Sí, lo recibí
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Mis cuentas" className="mb-4">
        <ObligationProgress acc={acc} perspective="participant" />
      </Card>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Card title="Cómo pagar">
          <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-mono text-sm">{settings.payment_instructions}</pre>
          <div className="mt-2">
            <CopyButton text={settings.payment_instructions} label="Copiar datos" />
          </div>
        </Card>

        <Card title="Enviar comprobante">
          <div id="pagar" />
          <form action={submitPayment} className="space-y-3">
            <Field label="Monto que pagaste (MXN)">
              <input name="amount" inputMode="decimal" required defaultValue={owes > 0 ? centsToInput(owes) : ""} className="input" />
            </Field>
            <Field label="Fecha del pago">
              <input name="paidOn" type="date" defaultValue={today} className="input" />
            </Field>
            {receivableObs.length > 1 && (
              <Field label="¿A qué corresponde?">
                <select name="obligationId" className="input">
                  <option value="">A lo más antiguo pendiente</option>
                  {receivableObs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Captura o PDF del comprobante">
              <EvidenceInput required />
            </Field>
            <Field label="Referencia / nota (opcional)">
              <input name="reference" className="input" />
            </Field>
            <SubmitButton className="btn-primary w-full" pendingText="Enviando…">
              Enviar comprobante
            </SubmitButton>
          </form>
        </Card>
      </div>

      <Card title="Mis pagos" className="mb-4">
        {acc.payments.length === 0 ? (
          <Empty>Aún no hay pagos registrados.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {acc.payments.map((x) => {
              const [l, tone] = PAYMENT_STATUS[x.status];
              return (
                <li key={x.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="num font-semibold">{money(x.amountCents)}</span>
                  {x.direction === "payable" ? <Badge tone="green">{owner} te pagó</Badge> : <Badge tone="blue">Tú pagaste</Badge>}
                  <Badge tone={tone}>{l}</Badge>
                  <span className="text-xs text-slate-500">
                    {METHOD_LABEL[x.method]} · {fmtDate(x.paidOn)}
                  </span>
                  {x.reviewNote && <span className="w-full text-xs text-slate-500">Nota: {x.reviewNote}</span>}
                  {x.evidenceId && (
                    <a href={`/api/evidence/${x.evidenceId}`} target="_blank" rel="noreferrer" className="ml-auto text-xs text-brand-600 underline">
                      ver comprobante
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={hasPayable ? "Movimientos (lo que debes y lo que te deben)" : "Historial de cargos"}>
        <StatementTable acc={acc} direction={hasPayable ? undefined : "receivable"} perspective="participant" />
      </Card>

      <p className="mt-6 text-center text-xs text-slate-400">
        Este enlace es personal. Agrégalo a tu pantalla de inicio para consultarlo cuando quieras.
      </p>
    </main>
  );
}
