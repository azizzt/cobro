import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { checkAdminPassword, isAdmin, startAdminSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Acceso administrador" };

async function login(fd: FormData) {
  "use server";
  const pwd = String(fd.get("password") ?? "");
  if (!checkAdminPassword(pwd)) {
    await new Promise((r) => setTimeout(r, 800)); // frena intentos por fuerza bruta
    await audit("system", "admin.login_failed");
    redirect("/login?error=1");
  }
  await startAdminSession();
  await audit("admin", "admin.login");
  redirect("/admin");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdmin()) redirect("/admin");
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-4 text-xl font-semibold">Acceso administrador</h1>
      <form action={login} className="card space-y-4">
        {error && <p className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700">Contraseña incorrecta</p>}
        <label className="block">
          <span className="label">Contraseña</span>
          <input type="password" name="password" required autoFocus autoComplete="current-password" className="input" />
        </label>
        <SubmitButton className="btn-primary w-full" pendingText="Entrando…">
          Entrar
        </SubmitButton>
      </form>
    </main>
  );
}
