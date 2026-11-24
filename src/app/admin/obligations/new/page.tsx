import { asc, eq } from "drizzle-orm";
import { db, t } from "@/db";
import { todayISO } from "@/lib/dates";
import { Card, Flash, PageHeader } from "@/components/ui";
import { saveObligation } from "../../actions";
import { ObligationForm } from "../form";

export default async function NewObligation({
  searchParams,
}: {
  searchParams: Promise<{ participant?: string; ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const [participants, services] = await Promise.all([
    db.select({ id: t.participants.id, name: t.participants.name }).from(t.participants).where(eq(t.participants.active, true)).orderBy(asc(t.participants.name)),
    db.select({ id: t.services.id, name: t.services.name }).from(t.services).where(eq(t.services.active, true)),
  ]);
  return (
    <>
      <PageHeader title="Nueva obligación" subtitle="Define qué se cobra (o qué debes), cuánto y cuándo." />
      <Flash ok={sp.ok} error={sp.error} />
      <Card>
        {participants.length === 0 ? (
          <p className="text-sm text-slate-600">Primero agrega a una persona en la sección Personas.</p>
        ) : (
          <ObligationForm
            action={saveObligation.bind(null, null)}
            participants={participants}
            services={services}
            defaults={{ participantId: sp.participant ? Number(sp.participant) : undefined, startDate: todayISO() }}
            submitLabel="Crear obligación"
          />
        )}
      </Card>
    </>
  );
}
