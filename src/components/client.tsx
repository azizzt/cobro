"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className = "btn-primary",
  confirm: confirmText,
  pendingText = "Guardando…",
  name,
  value,
}: {
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  pendingText?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function CopyButton({
  text,
  label = "Copiar",
  className = "btn-secondary btn-sm",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "¡Copiado!" : label}
    </button>
  );
}

/**
 * Abre WhatsApp con el mensaje prellenado y, en paralelo, marca el
 * recordatorio como enviado (Server Action recibida como prop).
 */
export function WhatsAppSendButton({
  href,
  onSent,
  label = "Enviar por WhatsApp",
  className = "btn-success btn-sm",
}: {
  href: string;
  onSent?: () => Promise<void>;
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      onClick={() => {
        if (onSent) void onSent();
      }}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.1.3.6 1.1 1.4 1.8 1 .9 1.8 1.1 2.1 1.3.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.4Z" />
      </svg>
      {label}
    </a>
  );
}

/** Selector de archivo que comprime imágenes en el navegador (máx. 1600 px, JPEG 0.8). */
export function EvidenceInput({ name = "evidence", required = false }: { name?: string; required?: boolean }) {
  const [info, setInfo] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return setInfo(null);
    if (!file.type.startsWith("image/") || file.type === "image/gif") {
      setInfo(`${file.name} · ${(file.size / 1024).toFixed(0)} KB`);
      return;
    }
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.8));
      if (blob.size < file.size) {
        const compressed = new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
        const dt = new DataTransfer();
        dt.items.add(compressed);
        input.files = dt.files;
        setInfo(`${compressed.name} · ${(compressed.size / 1024).toFixed(0)} KB (comprimida)`);
        return;
      }
    } catch {
      /* si falla la compresión se envía el original */
    }
    setInfo(`${file.name} · ${(file.size / 1024).toFixed(0)} KB`);
  }

  return (
    <div>
      <input
        type="file"
        name={name}
        accept="image/*,application/pdf"
        required={required}
        onChange={onChange}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
      />
      {info && <p className="mt-1 text-xs text-slate-500">{info}</p>}
    </div>
  );
}
