# Cobro

Control de gastos compartidos y cobros personales: suscripciones (Spotify, YouTube, Meli+…), compras a meses sin intereses, préstamos y cargos únicos, **en ambos sentidos** (lo que te deben y lo que tú debes).

- **Panel del administrador:** saldos por persona, vencimientos, comprobantes por revisar, cola de recordatorios de WhatsApp, plataformas (costo vs. recuperado), compensación de saldos, respaldos.
- **Portal del participante:** se abre con un enlace personal (sin contraseña), muestra su saldo y progreso, botón *Enterado*, subida de comprobantes y confirmación de pagos recibidos.
- **Automático:** cron diario que genera cargos, aplica recargos, cierra deudas terminadas y crea recordatorios.

Stack: Next.js 16 · Drizzle ORM · Postgres (Neon) · Vercel · Tailwind. Costo: $0.

## Inicio rápido (local)

```powershell
npm install
npm run setup
npm run dev
```

Abre http://localhost:3000/login (contraseña de desarrollo: `admin`) o el portal de ejemplo http://localhost:3000/p/demo-ana.

## Documentación

- [Arquitectura y decisiones](docs/ARQUITECTURA.md): chatbot vs. web app, stack, modelo de datos, deudas en ambos sentidos.
- [Guía de implementación paso a paso](docs/DESPLIEGUE.md): GitHub → Neon → Vercel → notificaciones → respaldos.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run setup` | Migraciones + datos demo (local) |
| `npm run db:migrate` | Aplica migraciones (`DATABASE_URL` o PGlite local) |
| `npm run db:generate` | Genera una migración tras cambiar `src/db/schema.ts` |
| `npm test` | Pruebas del motor de saldos y calendarios |
| `npm run typecheck` / `npm run lint` | Verificaciones |

## Estructura

```
src/
  db/schema.ts        Tablas (participants, services, obligations, charges, payments, reminders…)
  lib/ledger.ts       Motor de saldos (aplicación FIFO de pagos, saldo arrastrado, neto)
  lib/schedule.ts     Calendario de periodos (MSI, suscripciones, fin de mes)
  lib/jobs.ts         Proceso diario: cargos, recargos, recordatorios, resumen
  lib/notify.ts       WhatsApp (wa.me / Cloud API), correo SMTP, CallMeBot
  app/admin/          Panel del administrador
  app/portal/         Portal del participante
  app/p/[token]/      Entrada por enlace personal
  app/api/            Cron, comprobantes, exportación
drizzle/              Migraciones SQL
scripts/              Migración y datos demo
```
