import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

/**
 * Todas las cantidades se guardan en CENTAVOS (enteros) para evitar errores
 * de redondeo. $299.00 MXN = 29900.
 */

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType() {
    return "bytea";
  },
});

// ── Enums ────────────────────────────────────────────────────────────────

/** Quién le debe a quién. receivable = el participante me debe; payable = yo le debo. */
export const directionEnum = pgEnum("direction", ["receivable", "payable"]);

export const obligationKindEnum = pgEnum("obligation_kind", [
  "subscription", // plataforma recurrente (Spotify, YouTube, Meli+…)
  "installment", // compra a meses sin intereses (MSI)
  "loan", // préstamo en parcialidades
  "one_time", // cargo único
]);

export const frequencyEnum = pgEnum("frequency", ["monthly", "biweekly", "weekly", "once"]);

export const obligationStatusEnum = pgEnum("obligation_status", [
  "active",
  "paused",
  "completed",
  "cancelled",
]);

export const chargeKindEnum = pgEnum("charge_kind", ["regular", "late_fee", "adjustment"]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "transfer",
  "cash",
  "card",
  "offset", // compensación entre lo que me deben y lo que debo
  "waiver", // condonación / descuento
  "other",
]);

export const paymentStatusEnum = pgEnum("payment_status", ["pending", "approved", "rejected"]);

export const actorEnum = pgEnum("actor", ["admin", "participant", "system"]);

export const reminderTypeEnum = pgEnum("reminder_type", [
  "upcoming",
  "due",
  "overdue",
  "manual",
  "payment_update",
]);

export const reminderStatusEnum = pgEnum("reminder_status", ["pending", "sent", "failed", "skipped"]);

export const channelEnum = pgEnum("channel", ["whatsapp_link", "whatsapp_api", "email", "portal"]);

// ── Tablas ───────────────────────────────────────────────────────────────

export const participants = pgTable("participants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /** Teléfono en formato internacional sin "+", ej. 5215512345678 */
  phone: text("phone"),
  email: text("email"),
  /** Token del enlace personal de acceso (/p/<token>). Se puede regenerar. */
  accessToken: text("access_token").notNull().unique(),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  notifyWhatsapp: boolean("notify_whatsapp").notNull().default(true),
  notifyEmail: boolean("notify_email").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Plataformas de suscripción de las que soy titular (para ver costo vs. recuperado). */
export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  monthlyCostCents: integer("monthly_cost_cents").notNull().default(0),
  /** Día del mes en que la plataforma me cobra a mí */
  billingDay: integer("billing_day"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Obligación = "contrato" entre un participante y yo. Define el calendario
 * de cargos. Sirve tanto para suscripciones (indefinidas) como para MSI y
 * préstamos (con número de periodos), en ambos sentidos.
 */
export const obligations = pgTable(
  "obligations",
  {
    id: serial("id").primaryKey(),
    participantId: integer("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    serviceId: integer("service_id").references(() => services.id, { onDelete: "set null" }),
    kind: obligationKindEnum("kind").notNull(),
    direction: directionEnum("direction").notNull().default("receivable"),
    title: text("title").notNull(),
    description: text("description"),
    frequency: frequencyEnum("frequency").notNull().default("monthly"),
    /** Monto de cada periodo (suscripciones). En MSI/préstamos se deriva del total. */
    amountPerPeriodCents: integer("amount_per_period_cents"),
    /** Monto total (MSI/préstamos/cargo único) */
    totalAmountCents: integer("total_amount_cents"),
    /** Número de periodos (null = indefinido, ej. suscripción) */
    periodsTotal: integer("periods_total"),
    /** Fecha de vencimiento del primer periodo */
    startDate: date("start_date", { mode: "string" }).notNull(),
    /** Fecha a partir de la cual ya no se generan cargos (opcional) */
    endDate: date("end_date", { mode: "string" }),
    /** Recargo opcional por pago tardío (una vez por periodo vencido) */
    lateFeeCents: integer("late_fee_cents").notNull().default(0),
    status: obligationStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("obligations_participant_idx").on(t.participantId)],
);

/** Cargo = una mensualidad/periodo concreto generado a partir de una obligación. */
export const charges = pgTable(
  "charges",
  {
    id: serial("id").primaryKey(),
    obligationId: integer("obligation_id")
      .notNull()
      .references(() => obligations.id, { onDelete: "cascade" }),
    participantId: integer("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    direction: directionEnum("direction").notNull(),
    kind: chargeKindEnum("kind").notNull().default("regular"),
    /** 1..N para cargos regulares/recargos; null para ajustes manuales */
    periodNumber: integer("period_number"),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("charges_period_uq").on(t.obligationId, t.periodNumber, t.kind),
    index("charges_participant_idx").on(t.participantId),
  ],
);

export const evidenceFiles = pgTable("evidence_files", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Pago = movimiento de dinero (o compensación/condonación). Si tiene
 * obligationId se aplica primero a esa obligación; el excedente (o los pagos
 * sin obligación) se aplica a los cargos más antiguos del mismo sentido.
 */
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    participantId: integer("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    obligationId: integer("obligation_id").references(() => obligations.id, {
      onDelete: "set null",
    }),
    direction: directionEnum("direction").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    method: paymentMethodEnum("method").notNull().default("transfer"),
    reference: text("reference"),
    note: text("note"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    evidenceId: integer("evidence_id").references(() => evidenceFiles.id, { onDelete: "set null" }),
    submittedBy: actorEnum("submitted_by").notNull(),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** Para pagos que YO hago: el participante confirma que lo recibió */
    participantConfirmedAt: timestamp("participant_confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_participant_idx").on(t.participantId)],
);

export const reminders = pgTable(
  "reminders",
  {
    id: serial("id").primaryKey(),
    participantId: integer("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    type: reminderTypeEnum("type").notNull(),
    /** Fecha (local) para la que se generó; evita duplicados del cron */
    forDate: date("for_date", { mode: "string" }).notNull(),
    message: text("message").notNull(),
    channel: channelEnum("channel").notNull(),
    status: reminderStatusEnum("status").notNull().default("pending"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdBy: actorEnum("created_by").notNull().default("system"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reminders_participant_idx").on(t.participantId, t.forDate)],
);

/** Configuración editable desde el panel (datos bancarios, políticas de recordatorio…). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actor: actorEnum("actor").notNull(),
  participantId: integer("participant_id"),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: integer("entity_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Participant = typeof participants.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Obligation = typeof obligations.$inferSelect;
export type Charge = typeof charges.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type Direction = (typeof directionEnum.enumValues)[number];
