import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { pendingPaymentsCount } from "@/lib/data";
import { logout } from "./actions";
import { NavLinks } from "./nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const pending = await pendingPaymentsCount();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-7 w-7" />
            <span className="hidden sm:inline">Cobro</span>
          </Link>
          <NavLinks pending={pending} />
          <form action={logout} className="ml-auto">
            <button className="btn-secondary btn-sm">Salir</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
