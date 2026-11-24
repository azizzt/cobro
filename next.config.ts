import type { NextConfig } from "next";

// Nota: cacheComponents está desactivado a propósito. Toda la app es
// dinámica (datos por usuario y sesión), así que usamos renderizado por
// petición clásico (`dynamic = "force-dynamic"` en el layout raíz).
const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    serverActions: {
      // Comprobantes de pago (las imágenes se comprimen en el navegador).
      bodySizeLimit: "4mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
