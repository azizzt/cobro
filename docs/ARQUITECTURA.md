# Arquitectura de Cobro

## 1. ¿Chatbot de WhatsApp o Web App + notificaciones?

**Recomendación: Web App (PWA) + WhatsApp solo como canal de notificaciones.**

| Criterio | Chatbot de WhatsApp | Web App + WhatsApp para avisos |
|---|---|---|
| Costo | Cada mensaje que inicia el negocio es una *plantilla* de pago en la API de Meta; un bot conversacional además necesita webhook siempre disponible | $0 con enlaces `wa.me`; la API de Meta es opcional |
| Ver progreso, historial, tablas | Muy pobre en texto plano | Natural: barras de progreso, tablas, filtros |
| Subir comprobantes | Posible pero complejo (descargar media vía API, asociarla al usuario) | Formulario con compresión de imagen en el navegador |
| Riesgo de bloqueo | Librerías no oficiales (Baileys, whatsapp-web.js) violan los términos y pueden bloquear tu número | Ninguno |
| Mantenimiento | Máquina de estados de comandos, parsing, sesiones | CRUD estándar |
| Experiencia del usuario | Tiene que aprender comandos | Toca un enlace y ve todo |

El punto clave: con 20 usuarios el cuello de botella no es la tecnología sino **la fricción**. El participante recibe un WhatsApp con *su enlace personal*, lo abre, ve cuánto debe, toca "Enterado" y sube su captura. No necesita contraseña ni comandos.

### Estrategia de WhatsApp en 3 niveles (de $0 a casi $0)

1. **Enlace `wa.me` (por defecto, $0, sin riesgo).** El cron diario arma el mensaje y lo deja en la cola "Por enviar" del panel. Tú tocas *Enviar por WhatsApp*, se abre tu WhatsApp con el texto prellenado y presionas enviar. Con 20 personas son unos segundos al día.
2. **Avisos para ti vía CallMeBot ($0).** Servicio gratuito que solo envía WhatsApp *a tu propio número*: resumen diario y "X subió un comprobante".
3. **WhatsApp Cloud API de Meta (opcional, totalmente automático).** El código ya está listo (`WHATSAPP_TOKEN`...). Meta cobra por cada plantilla de tipo *utility* entregada (en México cuesta centavos de dólar por mensaje; revisa la tarifa vigente). Actívalo solo si los clics manuales te estorban.

Además, todos los avisos se muestran en el **portal** (con botón *Enterado*) y opcionalmente por **correo** con tu Gmail/Workspace (gratis, vía SMTP con contraseña de aplicación).

## 2. Stack tecnológico ($0)

| Capa | Elección | Por qué |
|---|---|---|
| Frontend + backend | **Next.js 16** (App Router, Server Actions, TypeScript, Tailwind) | Un solo proyecto, sin API separada; las acciones del servidor validan sesión en cada operación |
| Hosting | **Vercel Hobby** (gratis) | Deploy automático desde GitHub, HTTPS, cron diario incluido |
| Base de datos | **Neon Postgres** (free tier permanente, 0.5 GB) | Postgres serverless que "despierta" solo; no se pausa indefinidamente como el free tier de Supabase |
| ORM | **Drizzle** | Ligero, tipado, migraciones SQL versionadas en `drizzle/` |
| Desarrollo local | **PGlite** (Postgres embebido) | `npm run setup` y listo, sin instalar Postgres |
| Comprobantes | Dentro de Postgres (`bytea`), comprimidos en el navegador a ~150 KB | Sin servicio extra. 20 personas × 12 comprobantes/año ≈ 40 MB/año |
| Cron | Vercel Cron (1 vez al día) | Gratis; alternativa: GitHub Actions o cron-job.org |
| Correo | Gmail / Google Workspace SMTP | Ya lo tienes |
| Respaldo | Exportación JSON/CSV desde el panel + workflow opcional de GitHub Actions (`pg_dump`) | Puedes guardar los respaldos en tu Google Drive de 5 TB |

### ¿Y Azure?

Tu cuenta Azure for Students trae crédito anual que **caduca y hay que renovar**, así que no conviene que la app *dependa* de ella. El proyecto es portable y puedes moverlo a Azure si lo prefieres:

- **Base de datos:** Azure Database for PostgreSQL Flexible Server (B1ms, 12 meses gratis con la oferta de estudiante) — solo cambias `DATABASE_URL`.
- **Hosting:** Azure App Service (plan F1 gratuito, Node 22+) con `npm run build && npm start`, y el cron con una Logic App o GitHub Actions.

Para Google: Gmail SMTP (correos), Google Drive (respaldos). Google AI Pro no se necesita para la operación diaria.

## 3. Modelo de datos

Todas las cantidades se guardan en **centavos** (enteros).

```
participants ──< obligations ──< charges
     │               │
     │               └── services (plataforma, opcional)
     ├──< payments ──── evidence_files
     ├──< reminders
     └── (audit_log, settings)
```

- **participants**: nombre, teléfono, correo, `access_token` del enlace personal, preferencias de notificación.
- **services**: plataformas de las que eres titular (Spotify $299 día 5…) para comparar *costo vs. recuperado*.
- **obligations**: el "contrato". Un solo modelo cubre todo gracias a 3 campos:
  - `kind`: `subscription` | `installment` (MSI) | `loan` | `one_time`
  - `direction`: `receivable` (me debe) | `payable` (**yo le debo**)
  - calendario: `frequency`, `start_date`, `periods_total` (null = indefinido), `amount_per_period` **o** `total_amount` (el total se reparte y el residuo de centavos va al último pago), `end_date`, `late_fee`.
- **charges**: cada mensualidad concreta (`period_number`, `due_date`, `amount`). El cron las genera unos días antes del vencimiento. Índice único `(obligation, period, kind)` → el cron es idempotente. Tipos: `regular`, `late_fee` (recargo), `adjustment` (cargo extra).
- **payments**: dinero que entra o sale (`direction`), con método (`transfer`, `cash`, `offset` = compensación, `waiver` = condonación), estado (`pending` → `approved`/`rejected`), comprobante y confirmación de recibido.
- **reminders**: cada aviso, canal, estado de envío y `acknowledged_at` ("Enterado").

### Suscripción vs. MSI

| | Suscripción | MSI / préstamo |
|---|---|---|
| `periods_total` | null (indefinido) o N | N meses |
| Monto | `amount_per_period` | `total_amount` (se reparte) |
| Fin | Pausar / cancelar / `end_date` | Se marca **terminada** sola al pagar el último periodo |
| Progreso | "N periodos pagados" | "4 de 12 pagos, faltan 8" |

### Saldos acumulados (la clave del diseño)

No se guarda "cuánto de cada pago se aplicó a qué cargo". El saldo se **calcula** (`src/lib/ledger.ts`, función pura con pruebas):

1. Por cada sentido (me deben / debo) por separado.
2. Un pago ligado a una obligación se aplica primero a ella.
3. Pagos generales y excedentes → a los cargos más antiguos (FIFO).
4. Lo que sobra = saldo a favor.

Consecuencias:
- Si alguien no paga un mes, el cargo queda abierto y **se suma automáticamente** al siguiente periodo.
- Si paga de más, el excedente cubre lo siguiente.
- Puedes editar una obligación (precio, meses) y el calendario se regenera; los pagos se reaplican solos, sin datos inconsistentes.

## 4. Cuando YO le debo a alguien

Cubierto con `direction = payable` en obligaciones, cargos y pagos:

- Registras "Préstamo que me hizo Carla, 6 pagos" como obligación **Yo le debo**.
- El panel muestra *Me deben*, *Yo debo* y el **neto** por persona.
- El resumen diario te avisa lo que tú debes pagar en los próximos 3 días.
- Cuando pagas, registras el pago (con comprobante) y la persona ve en su portal "Luis te pagó" con un botón **Sí, lo recibí**.
- **Compensación:** si alguien te debe $66 y tú le debes $1,000, un botón cancela $66 en ambos sentidos sin mover dinero.
- Los recordatorios automáticos no se envían a quien, en neto, tú le debes más.

## 5. Funcionalidades extra incluidas

Administrador: recargo opcional por atraso con días de gracia, cargos extra, condonaciones, compensación de saldos, panel de plataformas (costo vs. recuperado), cola de recordatorios con envío de un toque, resumen diario, bitácora de auditoría, exportación JSON/CSV, regenerar el enlace de alguien si se filtra, desactivar personas sin perder historial.

Participante: enlace personal sin contraseña (instalable como app en el celular), saldo grande y claro, próximo vencimiento, progreso por cuenta, botón *Enterado*, subir comprobante (se comprime la foto automáticamente), datos bancarios con botón copiar, historial de pagos con estado, avisos de "pago confirmado/rechazado", confirmar pagos recibidos.

## Seguridad

- Admin: contraseña en variable de entorno, sesión JWT firmada (cookie httpOnly), retardo ante contraseña incorrecta, verificación en cada página **y** en cada Server Action.
- Participantes: token aleatorio de 144 bits en el enlace; la sesión guarda una huella del token, así que *regenerar enlace* invalida sesiones viejas. Cada participante solo puede ver sus datos y sus comprobantes.
- Cron protegido con `CRON_SECRET`. Sitio marcado como `noindex`.
- Riesgo aceptado: quien tenga el enlace de alguien ve su estado de cuenta. Para 20 personas de confianza es un buen balance; si se filtra, se regenera.
