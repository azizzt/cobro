CREATE TYPE "public"."actor" AS ENUM('admin', 'participant', 'system');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('whatsapp_link', 'whatsapp_api', 'email', 'portal');--> statement-breakpoint
CREATE TYPE "public"."charge_kind" AS ENUM('regular', 'late_fee', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('receivable', 'payable');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('monthly', 'biweekly', 'weekly', 'once');--> statement-breakpoint
CREATE TYPE "public"."obligation_kind" AS ENUM('subscription', 'installment', 'loan', 'one_time');--> statement-breakpoint
CREATE TYPE "public"."obligation_status" AS ENUM('active', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('transfer', 'cash', 'card', 'offset', 'waiver', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."reminder_type" AS ENUM('upcoming', 'due', 'overdue', 'manual', 'payment_update');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" "actor" NOT NULL,
	"participant_id" integer,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" integer,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" serial PRIMARY KEY NOT NULL,
	"obligation_id" integer NOT NULL,
	"participant_id" integer NOT NULL,
	"direction" "direction" NOT NULL,
	"kind" charge_kind DEFAULT 'regular' NOT NULL,
	"period_number" integer,
	"due_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obligations" (
	"id" serial PRIMARY KEY NOT NULL,
	"participant_id" integer NOT NULL,
	"service_id" integer,
	"kind" "obligation_kind" NOT NULL,
	"direction" "direction" DEFAULT 'receivable' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"frequency" "frequency" DEFAULT 'monthly' NOT NULL,
	"amount_per_period_cents" integer,
	"total_amount_cents" integer,
	"periods_total" integer,
	"start_date" date NOT NULL,
	"end_date" date,
	"late_fee_cents" integer DEFAULT 0 NOT NULL,
	"status" "obligation_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"access_token" text NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"notify_whatsapp" boolean DEFAULT true NOT NULL,
	"notify_email" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_access_token_unique" UNIQUE("access_token")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"participant_id" integer NOT NULL,
	"obligation_id" integer,
	"direction" "direction" NOT NULL,
	"amount_cents" integer NOT NULL,
	"paid_on" date NOT NULL,
	"method" "payment_method" DEFAULT 'transfer' NOT NULL,
	"reference" text,
	"note" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"evidence_id" integer,
	"submitted_by" "actor" NOT NULL,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"participant_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"participant_id" integer NOT NULL,
	"type" "reminder_type" NOT NULL,
	"for_date" date NOT NULL,
	"message" text NOT NULL,
	"channel" "channel" NOT NULL,
	"status" "reminder_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"created_by" "actor" DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"monthly_cost_cents" integer DEFAULT 0 NOT NULL,
	"billing_day" integer,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_evidence_id_evidence_files_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "charges_period_uq" ON "charges" USING btree ("obligation_id","period_number","kind");--> statement-breakpoint
CREATE INDEX "charges_participant_idx" ON "charges" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "obligations_participant_idx" ON "obligations" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "payments_participant_idx" ON "payments" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "reminders_participant_idx" ON "reminders" USING btree ("participant_id","for_date");