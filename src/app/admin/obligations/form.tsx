"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/client";

type Opt = { id: number; name: string; monthlyCostCents?: number };
type Defaults = {
  participantId?: number;
  serviceId?: number | null;
  kind?: string;
  direction?: string;
  title?: string;
  description?: string | null;
  frequency?: string;
  amountPerPeriod?: string;
  totalAmount?: string;
  periodsTotal?: number | null;
  startDate?: string;
  endDate?: string | null;
  lateFee?: string;
};

const HELP: Record<string, string> = {
  subscription: "Cobro recurrente (Spotify, YouTube, Meli+…). Se genera un cargo cada periodo hasta que la pauses, canceles o llegue la fecha fin.",
  installment: "Compra a meses sin intereses. Indica el total y el número de meses; el sistema reparte el monto.",
  loan: "Préstamo pagadero en parcialidades. Indica el total y el número de pagos (o el monto de cada pago).",
  one_time: "Un solo cargo (p. ej. una cena, un boleto, un préstamo que se paga de una vez).",
};

export function ObligationForm({
  action,
  participants,
  services,
  defaults = {},
  submitLabel = "Guardar",
}: {
  action: (fd: FormData) => Promise<void>;
  participants: Opt[];
  services: Opt[];
  defaults?: Defaults;
  submitLabel?: string;
}) {
  const [kind, setKind] = useState(defaults.kind ?? "subscription");
  const [direction, setDirection] = useState(defaults.direction ?? "receivable");
  const [total, setTotal] = useState(defaults.totalAmount ?? "");
  const [periods, setPeriods] = useState(defaults.periodsTotal ? String(defaults.periodsTotal) : "");
  const [title, setTitle] = useState(defaults.title ?? "");

  const isSub = kind === "subscription";
  const isOnce = kind === "one_time";
  const per = Number(total) && Number(periods) ? Number(total) / Number(periods) : null;

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="label">Persona</span>
        <select name="participantId" required defaultValue={defaults.participantId ?? ""} className="input">
          <option value="">Selecciona…</option>
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="block">
        <span className="label">¿Quién le debe a quién?</span>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["receivable", "Me debe a mí"],
            ["payable", "Yo le debo"],
          ].map(([v, l]) => (
            <label
              key={v}
              className={`cursor-pointer rounded-xl border px-3 py-2 text-center text-sm ${
                direction === v
                  ? v === "receivable"
                    ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                    : "border-rose-400 bg-rose-50 text-rose-800"
                  : "border-slate-300"
              }`}
            >
              <input type="radio" name="direction" value={v} checked={direction === v} onChange={() => setDirection(v)} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block sm:col-span-2">
        <span className="label">Tipo</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["subscription", "Suscripción"],
            ["installment", "MSI"],
            ["loan", "Préstamo"],
            ["one_time", "Cargo único"],
          ].map(([v, l]) => (
            <label
              key={v}
              className={`cursor-pointer rounded-xl border px-3 py-2 text-center text-sm ${kind === v ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300"}`}
            >
              <input type="radio" name="kind" value={v} checked={kind === v} onChange={() => setKind(v)} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
        <span className="mt-1 block text-xs text-slate-500">{HELP[kind]}</span>
      </label>

      {isSub && services.length > 0 && (
        <label className="block">
          <span className="label">Plataforma (opcional)</span>
          <select
            name="serviceId"
            defaultValue={defaults.serviceId ?? ""}
            className="input"
            onChange={(e) => {
              const s = services.find((x) => x.id === Number(e.target.value));
              if (s && !title) setTitle(s.name);
            }}
          >
            <option value="">—</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="label">Concepto</span>
        <input
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input"
          placeholder={isSub ? "Spotify Familiar" : kind === "installment" ? "iPhone 16 a 12 MSI" : "Préstamo"}
        />
      </label>

      {!isOnce && (
        <label className="block">
          <span className="label">Frecuencia</span>
          <select name="frequency" defaultValue={defaults.frequency ?? "monthly"} className="input">
            <option value="monthly">Mensual</option>
            <option value="biweekly">Quincenal (cada 14 días)</option>
            <option value="weekly">Semanal</option>
          </select>
        </label>
      )}

      {isSub ? (
        <label className="block">
          <span className="label">Monto por periodo (MXN)</span>
          <input name="amountPerPeriod" inputMode="decimal" required defaultValue={defaults.amountPerPeriod} className="input" placeholder="75.00" />
        </label>
      ) : (
        <label className="block">
          <span className="label">Monto total (MXN)</span>
          <input
            name="totalAmount"
            inputMode="decimal"
            required={isOnce}
            value={total}
            onChange={(e) => setTotal(e.target.value.replace(/[^\d.]/g, ""))}
            className="input"
            placeholder="15000.00"
          />
        </label>
      )}

      {!isOnce && (
        <label className="block">
          <span className="label">{isSub ? "Número de periodos (vacío = indefinido)" : "Número de pagos / meses"}</span>
          <input
            name="periodsTotal"
            type="number"
            min={1}
            max={360}
            required={!isSub}
            value={periods}
            onChange={(e) => setPeriods(e.target.value)}
            className="input"
          />
          {!isSub && per != null && (
            <span className="mt-1 block text-xs text-slate-500">
              ≈ {per.toLocaleString("es-MX", { style: "currency", currency: "MXN" })} por pago
            </span>
          )}
        </label>
      )}

      {!isSub && !isOnce && (
        <label className="block">
          <span className="label">Monto por pago (opcional)</span>
          <input name="amountPerPeriod" inputMode="decimal" defaultValue={defaults.amountPerPeriod} className="input" placeholder="Solo si no indicas total" />
        </label>
      )}

      <label className="block">
        <span className="label">{isOnce ? "Fecha de vencimiento" : "Primer vencimiento"}</span>
        <input name="startDate" type="date" required defaultValue={defaults.startDate} className="input" />
      </label>

      {isSub && (
        <label className="block">
          <span className="label">Fecha fin (opcional)</span>
          <input name="endDate" type="date" defaultValue={defaults.endDate ?? ""} className="input" />
        </label>
      )}

      {direction === "receivable" && (
        <label className="block">
          <span className="label">Recargo por atraso (opcional)</span>
          <input name="lateFee" inputMode="decimal" defaultValue={defaults.lateFee} className="input" placeholder="0.00" />
          <span className="mt-1 block text-xs text-slate-500">Se aplica una vez por periodo pasados los días de gracia.</span>
        </label>
      )}

      <label className="block sm:col-span-2">
        <span className="label">Descripción / notas</span>
        <textarea name="description" rows={2} defaultValue={defaults.description ?? ""} className="input" />
      </label>

      <div className="sm:col-span-2">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
