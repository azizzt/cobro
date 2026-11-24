import Link from "next/link";
import { loadAllLedgers } from "@/lib/data";
import { money } from "@/lib/money";
import { fmtDateTime } from "@/lib/dates";
import { Badge, Balance, Card, Empty, Field, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { createParticipant } from "../actions";

export default async function ParticipantsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { participants, ledgers } = await loadAllLedgers();

  return (
    <>
      <PageHeader title="Personas" subtitle="Quienes te deben o a quienes debes" />
      <Flash {...sp} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {participants.length === 0 ? (
            <Empty>Agrega a la primera persona con el formulario.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Contacto</th>
                    <th className="text-right">Me debe</th>
                    <th className="text-right">Le debo</th>
                    <th className="text-right">Neto</th>
                    <th>Último acceso</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((p) => {
                    const l = ledgers.get(p.id)!;
                    return (
                      <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                        <td>
                          <Link href={`/admin/participants/${p.id}`} className="font-medium hover:underline">
                            {p.name}
                          </Link>
                          {!p.active && <Badge>Inactivo</Badge>}
                        </td>
                        <td className="text-xs text-slate-500">
                          {p.phone ? `+${p.phone}` : "—"}
                          {p.email && <div>{p.email}</div>}
                        </td>
                        <td className="num text-right">{money(l.receivable.balance)}</td>
                        <td className="num text-right">{money(l.payable.balance)}</td>
                        <td className="text-right">
                          <Balance cents={l.net} />
                        </td>
                        <td className="text-xs text-slate-500">{p.lastSeenAt ? fmtDateTime(p.lastSeenAt) : "Nunca"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Agregar persona">
          <form action={createParticipant} className="space-y-3">
            <Field label="Nombre">
              <input name="name" required className="input" />
            </Field>
            <Field label="WhatsApp" hint="10 dígitos (México) o formato internacional">
              <input name="phone" inputMode="tel" className="input" placeholder="55 1234 5678" />
            </Field>
            <Field label="Correo (opcional)">
              <input name="email" type="email" className="input" />
            </Field>
            <Field label="Notas">
              <textarea name="notes" rows={2} className="input" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="notifyWhatsapp" defaultChecked /> Recordatorios por WhatsApp
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="notifyEmail" /> Recordatorios por correo
            </label>
            <SubmitButton>Agregar</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
