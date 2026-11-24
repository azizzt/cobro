import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Toda la app depende de la sesión y de datos en vivo.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Cobro", template: "%s · Cobro" },
  description: "Control de gastos compartidos, suscripciones, MSI y préstamos.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#1f57cf" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
