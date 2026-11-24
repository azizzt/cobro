import Link from "next/link";
import type { Participant, Payment, Reminder, Obligation } from "@/db/schema";
import { money } from "@/lib/money";
import { fmtDate, fmtDateTime, todayISO } from "@/lib/dates";
import { waLink } from "@/lib/notify";
import { Badge, CHANNEL_LABEL, DirectionBadge, Field, METHOD_LABEL, PAYMENT_STATUS, REMINDER_TYPE } from "@/components/ui";
import { EvidenceInput, SubmitButton, WhatsAppSendButton } from "@/components/client";
import { deletePayment, markReminderSent, registerPayment, reviewPayment, skipReminder } from "./actions";

/** Fila de recordatorio con botón para enviarlo por WhatsApp (modo enlace). */
export function ReminderItem({ r, p, back }: { r: Reminder; p?: Participant; back: string }) {
  const link = p ? waLink(p.phone, r.message) : null;
  const statusTone = { pending: "amber", sent: "green", failed: "red", skipped: "slate" } as const;
  const statusLabel = { pending: "Por enviar", sent: "Enviado", failed: "Falló", skipped: "Descartado" };
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          {p && (
            <Link href={`/admin/participants/${p.id}`} className="font-medium hover:underline">
              {p.name}
            </Link>
          )}
          <Badge tone="blue">{REMINDER_TYPE[r.type]}</Badge>
          <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
          <span className="text-xs text-slate-500">
            {CHANNEL_LABEL[r.channel]} · {fmtDateTime(r.createdAt)}
          </span>
          {r.acknowledgedAt && <Badge tone="green">Enterado {fmtDateTime(r.acknowledgedAt)}</Badge>}
        </div>
        <details className="mt-1 text-xs text-slate-500">
          <summary className="cursor-pointer">Ver mensaje</summary>
          <pre className="mt-1 whitespace-pre-wrap font-sans">{r.message}</pre>
        </details>
        {r.error && <p className="mt-1 text-xs text-rose-600">{r.error}</p>}
      </div>
      {r.status === "pending" && (
        <div className="flex shrink-0 gap-2">
          {link ? (
            <WhatsAppSendButton href={link} onSent={markReminderSent.bind(null, r.id)} />
          ) : (
            <span className="text-xs text-slate-500">Sin teléfono</span>
          )}
          <form action={skipReminder.bind(null, r.id, back)}>
            <SubmitButton className="btn-secondary btn-sm" pendingText="…">
              Descartar
            </SubmitButton>
          </form>
        </div>
      )}
    </li>
  );
}

/** Tarjeta de pago con evidencia y botones de revisión. */
export function PaymentItem({
  pay,
  participant,
  obligation,
  back,
  showReview = true,
}: {
  pay: Payment;
  participant?: Participant;
  obligation?: Obligation;
  back: string;
  showReview?: boolean;
}) {
  const [label, tone] = PAYMENT_STATUS[pay.status];
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="num text-base font-semibold">{money(pay.amountCents)}</span>
        <DirectionBadge direction={pay.direction} />
        <Badge tone={tone}>{label}</Badge>
        <span className="text-slate-500">
          {METHOD_LABEL[pay.method]} · {fmtDate(pay.paidOn)}
        </span>
        {participant && (
          <Link className="font-medium hover:underline" href={`/admin/participants/${participant.id}`}>
            {participant.name}
          </Link>
        )}
        {obligation && <span className="text-slate-500">→ {obligation.title}</span>}
        {pay.submittedBy === "participant" && <Badge tone="violet">Enviado por participante</Badge>}
        {pay.direction === "payable" &&
          (pay.participantConfirmedAt ? (
            <Badge tone="green">Recibido ✓</Badge>
          ) : (
            <Badge tone="slate">Sin confirmar</Badge>
          ))}
      </div>
      {(pay.reference || pay.note || pay.reviewNote) && (
        <p className="mt-1 text-xs text-slate-500">
          {[pay.reference && `Ref: ${pay.reference}`, pay.note, pay.reviewNote && `Revisión: ${pay.reviewNote}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {pay.evidenceId && (
          <a href={`/api/evidence/${pay.evidenceId}`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
            Ver comprobante
          </a>
        )}
        {showReview && pay.status === "pending" && (
          <form action={reviewPayment.bind(null, pay.id, back)} className="flex flex-wrap items-center gap-2">
            <input name="reviewNote" placeholder="Nota (opcional)" className="input w-44 py-1 text-xs" />
            <SubmitButton name="decision" value="approve" className="btn-success btn-sm" pendingText="…">
              Aprobar
            </SubmitButton>
            <SubmitButton name="decision" value="reject" className="btn-danger btn-sm" pendingText="…">
              Rechazar
            </SubmitButton>
          </form>
        )}
        <form action={deletePayment.bind(null, pay.id, back)}>
          <SubmitButton className="btn-sm text-xs text-slate-400 hover:text-rose-600" confirm="¿Eliminar este pago?" pendingText="…">
            Eliminar
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}

/** Formulario para registrar un pago recibido o un pago que yo hice. */
export function PaymentForm({
  participants,
  obligations,
  back,
  fixedParticipantId,
  defaultDirection = "receivable",
}: {
  participants: Participant[];
  obligations: Obligation[];
  back: string;
  fixedParticipantId?: number;
  defaultDirection?: "receivable" | "payable";
}) {
  return (
    <form action={registerPayment.bind(null, back)} className="grid gap-3 sm:grid-cols-2">
      {fixedParticipantId ? (
        <input type="hidden" name="participantId" value={fixedParticipantId} />
      ) : (
        <Field label="Persona">
          <select name="participantId" required className="input">
            <option value="">Selecciona…</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Sentido">
        <select name="direction" defaultValue={defaultDirection} className="input">
          <option value="receivable">Me pagó (recibí dinero)</option>
          <option value="payable">Le pagué (yo envié dinero)</option>
        </select>
      </Field>
      <Field label="Monto (MXN)">
        <input name="amount" inputMode="decimal" required placeholder="0.00" className="input" />
      </Field>
      <Field label="Fecha">
        <input type="date" name="paidOn" defaultValue={todayISO()} className="input" />
      </Field>
      <Field label="Método">
        <select name="method" className="input">
          {Object.entries(METHOD_LABEL)
            .filter(([k]) => k !== "offset")
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Aplicar a" hint="Opcional. Si no eliges, se aplica a lo más antiguo.">
        <select name="obligationId" className="input">
          <option value="">Lo más antiguo pendiente</option>
          {obligations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
              {fixedParticipantId ? "" : ` (#${o.participantId})`}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Referencia">
        <input name="reference" className="input" placeholder="Folio, clave de rastreo…" />
      </Field>
      <Field label="Nota">
        <input name="note" className="input" />
      </Field>
      <Field label="Comprobante (opcional)" className="sm:col-span-2">
        <EvidenceInput />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton>Registrar pago</SubmitButton>
      </div>
    </form>
  );
}
