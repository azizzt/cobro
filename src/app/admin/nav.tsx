"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/participants", label: "Personas" },
  { href: "/admin/obligations", label: "Obligaciones" },
  { href: "/admin/payments", label: "Pagos" },
  { href: "/admin/reminders", label: "Recordatorios" },
  { href: "/admin/services", label: "Plataformas" },
  { href: "/admin/settings", label: "Ajustes" },
];

export function NavLinks({ pending }: { pending: number }) {
  const path = usePathname();
  return (
    <nav className="-mx-1 flex flex-1 gap-1 overflow-x-auto text-sm">
      {LINKS.map((l) => {
        const active = l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`relative whitespace-nowrap rounded-lg px-2.5 py-1.5 ${
              active ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {l.label}
            {l.href === "/admin/payments" && pending > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">{pending}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
