import type { MetadataRoute } from "next";

// Permite "Agregar a pantalla de inicio" en el celular (PWA).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cobro · Estado de cuenta",
    short_name: "Cobro",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#1f57cf",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
