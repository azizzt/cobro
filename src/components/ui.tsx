import Link from "next/link";
import { money } from "@/lib/money";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-slate-700">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  tone = "slate",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "slate" | "green" | "red" | "amber" | "blue";
  hint?: React.ReactNode;
}) {
  const tones = {
    slate: "text-slate-900",
    green: "text-emerald-700",
    red: "text-rose-700",
    amber: "text-amber-700",
    blue: "text-brand-700",
  };
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`num mt-1 text-2xl font-semibold ${tones[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

const badgeTones = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  blue: "bg-brand-50 text-brand-700 ring-brand-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};
export type Tone = keyof typeof badgeTones;

export function Badge({ tone = "slate", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Progress({ value, max, tone = "blue" }: { value: number; max: number; tone?: "blue" | "green" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full ${tone === "green" ? "bg-emerald-500" : "bg-brand-500"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Saldo con color: positivo = me deben (verde), negativo = debo (rojo). */
export function Balance({ cents, className = "" }: { cents: number; className?: string }) {
  const tone = cents > 0 ? "text-emerald-700" : cents < 0 ? "text-rose-700" : "text-slate-500";
  return <span className={`num font-medium ${tone} ${className}`}>{money(cents)}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div
      className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
        error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
      role="status"
    >
      {error ?? ok}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-brand-600 hover:underline">
      {children}
    </Link>
  );
}

export function Field({
  label,
  children,
  hint,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

// ── Etiquetas en español ─────────────────────────────────────────────────

export const KIND_LABEL = {
  subscription: "Suscripción",
  installment: "Meses sin intereses",
  loan: "Préstamo",
  one_time: "Cargo único",
} as const;

export const FREQ_LABEL = {
  monthly: "Mensual",
  biweekly: "Quincenal",
  weekly: "Semanal",
  once: "Una vez",
} as const;

export const STATUS_LABEL = {
  active: ["Activa", "green"],
  paused: ["Pausada", "amber"],
  completed: ["Terminada", "blue"],
  cancelled: ["Cancelada", "slate"],
} as const satisfies Record<string, readonly [string, Tone]>;

export const METHOD_LABEL = {
  transfer: "Transferencia",
  cash: "Efectivo",
  card: "Tarjeta",
  offset: "Compensación",
  waiver: "Condonación",
  other: "Otro",
} as const;

export const PAYMENT_STATUS = {
  pending: ["Por revisar", "amber"],
  approved: ["Aprobado", "green"],
  rejected: ["Rechazado", "red"],
} as const satisfies Record<string, readonly [string, Tone]>;

export const REMINDER_TYPE = {
  upcoming: "Próximo pago",
  due: "Vence hoy",
  overdue: "Vencido",
  manual: "Manual",
  payment_update: "Aviso de pago",
} as const;

export const CHANNEL_LABEL = {
  whatsapp_link: "WhatsApp (manual)",
  whatsapp_api: "WhatsApp API",
  email: "Correo",
  portal: "Solo portal",
} as const;

export function DirectionBadge({ direction }: { direction: "receivable" | "payable" }) {
  return direction === "receivable" ? (
    <Badge tone="green">Me debe</Badge>
  ) : (
    <Badge tone="red">Le debo</Badge>
  );
}

export function ChargeStatusBadge({
  status,
  overdue,
  dueToday,
}: {
  status: "paid" | "partial" | "unpaid";
  overdue: boolean;
  dueToday?: boolean;
}) {
  if (status === "paid") return <Badge tone="green">Pagado</Badge>;
  if (overdue) return <Badge tone="red">{status === "partial" ? "Parcial · vencido" : "Vencido"}</Badge>;
  if (dueToday) return <Badge tone="amber">Vence hoy</Badge>;
  if (status === "partial") return <Badge tone="amber">Parcial</Badge>;
  return <Badge tone="slate">Pendiente</Badge>;
}
