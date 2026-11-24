import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin, currentParticipant } from "@/lib/auth";

export default async function Home({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  if (await isAdmin()) redirect("/admin");
  if (await currentParticipant()) redirect("/portal");
  const { expired } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-6 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-10 w-10" />
        <h1 className="text-2xl font-semibold tracking-tight">Cobro</h1>
      </div>
      <div className="card space-y-4">
        {expired ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Tu sesión expiró o tu enlace cambió. Pide al administrador tu enlace actualizado.
          </p>
        ) : null}
        <p className="text-slate-600">
          Para ver tu estado de cuenta abre el <strong>enlace personal</strong> que recibiste por WhatsApp.
          Puedes guardarlo en tu pantalla de inicio para consultarlo cuando quieras.
        </p>
        <Link href="/login" className="btn-secondary w-full">
          Soy el administrador
        </Link>
      </div>
    </main>
  );
}
