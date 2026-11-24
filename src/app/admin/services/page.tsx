import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, t } from "@/db";
import { centsToInput, money } from "@/lib/money";
import { Badge, Card, Empty, Field, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { deleteService, saveService } from "../actions";

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const [services, obligations, participants] = await Promise.all([
    db.select().from(t.services).orderBy(asc(t.services.name)),
    db.select().from(t.obligations),
    db.select().from(t.participants),
  ]);
  const names = new Map(participants.map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader title="Plataformas" subtitle="Suscripciones de las que eres titular: cuánto te cuestan y cuánto recuperas" />
      <Flash {...sp} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {services.length === 0 && <Empty>Agrega tus plataformas (Spotify, YouTube Premium, Meli+…).</Empty>}
          {services.map((s) => {
            const members = obligations.filter((o) => o.serviceId === s.id && o.status === "active");
            const recovered = members.filter((o) => o.frequency === "monthly").reduce((x, o) => x + (o.amountPerPeriodCents ?? 0), 0);
            return (
              <Card
                key={s.id}
                title={
                  <span className="flex items-center gap-2">
                    {s.name} {!s.active && <Badge>Inactiva</Badge>}
                  </span>
                }
                actions={
                  <span className="text-xs text-slate-500">{s.billingDay ? `Te cobran el día ${s.billingDay}` : ""}</span>
                }
              >
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">Costo mensual</div>
                    <div className="num font-semibold">{money(s.monthlyCostCents)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Recuperas</div>
                    <div className="num font-semibold text-emerald-700">{money(recovered)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Tu parte</div>
                    <div className="num font-semibold">{money(Math.max(0, s.monthlyCostCents - recovered))}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {members.length === 0 ? (
                    <span className="text-xs text-slate-500">Nadie asignado aún.</span>
                  ) : (
                    members.map((o) => (
                      <Link key={o.id} href={`/admin/obligations/${o.id}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs hover:bg-slate-200">
                        {names.get(o.participantId)} · {money(o.amountPerPeriodCents)}
                      </Link>
                    ))
                  )}
                  <Link href="/admin/obligations/new" className="rounded-full px-2.5 py-1 text-xs text-brand-600 hover:underline">
                    + asignar persona
                  </Link>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-slate-500">Editar</summary>
                  <form action={saveService.bind(null, s.id)} className="mt-2 grid gap-2 sm:grid-cols-4">
                    <input name="name" defaultValue={s.name} required className="input sm:col-span-2" />
                    <input name="monthlyCost" defaultValue={centsToInput(s.monthlyCostCents)} className="input" inputMode="decimal" />
                    <input name="billingDay" type="number" min={1} max={31} defaultValue={s.billingDay ?? ""} className="input" placeholder="Día" />
                    <input name="notes" defaultValue={s.notes ?? ""} className="input sm:col-span-3" placeholder="Notas" />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="hidden" name="active" value="false" />
                      <input type="checkbox" name="active" defaultChecked={s.active} /> Activa
                    </label>
                    <SubmitButton className="btn-secondary btn-sm">Guardar</SubmitButton>
                  </form>
                  <form action={deleteService.bind(null, s.id)} className="mt-2">
                    <SubmitButton className="btn-danger btn-sm" confirm="¿Eliminar la plataforma? Las obligaciones se conservan.">
                      Eliminar
                    </SubmitButton>
                  </form>
                </details>
              </Card>
            );
          })}
        </div>
        <Card title="Agregar plataforma" className="h-fit">
          <form action={saveService.bind(null, null)} className="space-y-3">
            <Field label="Nombre">
              <input name="name" required className="input" placeholder="Spotify Familiar" />
            </Field>
            <Field label="Costo mensual (MXN)">
              <input name="monthlyCost" inputMode="decimal" className="input" placeholder="299.00" />
            </Field>
            <Field label="Día en que te cobran">
              <input name="billingDay" type="number" min={1} max={31} className="input" />
            </Field>
            <Field label="Notas">
              <input name="notes" className="input" />
            </Field>
            <SubmitButton>Agregar</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
