import "server-only";
import nodemailer from "nodemailer";

/**
 * Canales de notificación. Todos son opcionales; sin configuración la app
 * genera enlaces wa.me para que el administrador envíe el mensaje con un toque.
 */

export const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
export const portalLink = (token: string) => `${appUrl()}/p/${token}`;

/** Normaliza teléfono a dígitos. 10 dígitos → se asume México (52). */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 10) d = "52" + d;
  return d.length >= 11 ? d : null;
}

export function waLink(phone: string | null | undefined, text: string): string | null {
  const p = normalizePhone(phone);
  if (!p) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

// ── WhatsApp Cloud API (Meta) ──────────────────────────────────────────

export const whatsappApiEnabled = () =>
  Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

/**
 * Envía una plantilla aprobada. Fuera de la ventana de 24 h Meta solo permite
 * plantillas; la plantilla sugerida tiene 3 variables: {{1}} nombre,
 * {{2}} monto, {{3}} enlace.
 */
export async function sendWhatsAppTemplate(phone: string, params: string[]) {
  const to = normalizePhone(phone);
  if (!to) throw new Error("Teléfono inválido");
  const version = process.env.WHATSAPP_API_VERSION || "v23.0";
  const res = await fetch(
    `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: process.env.WHATSAPP_TEMPLATE || "recordatorio_pago",
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "es_MX" },
          components: [
            { type: "body", parameters: params.map((text) => ({ type: "text", text })) },
          ],
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// ── Correo (SMTP, p. ej. Gmail con contraseña de aplicación) ──────────

export const emailEnabled = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
export async function sendEmail(to: string, subject: string, text: string) {
  if (!emailEnabled()) throw new Error("SMTP no configurado");
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
}

// ── Avisos al administrador ────────────────────────────────────────────

/** WhatsApp a mí mismo vía CallMeBot (gratis) y/o correo. Nunca lanza error. */
export async function notifyAdmin(text: string, subject = "Cobro: aviso") {
  const jobs: Promise<unknown>[] = [];
  const phone = normalizePhone(process.env.ADMIN_PHONE);
  if (phone && process.env.CALLMEBOT_APIKEY) {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(text)}&apikey=${process.env.CALLMEBOT_APIKEY}`;
    jobs.push(fetch(url));
  }
  if (emailEnabled() && process.env.ADMIN_EMAIL) {
    jobs.push(sendEmail(process.env.ADMIN_EMAIL, subject, text));
  }
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === "rejected") console.error("notifyAdmin", r.reason);
}
