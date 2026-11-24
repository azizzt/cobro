# Guía de implementación paso a paso

Tiempo estimado: 45–60 minutos. Costo: $0.

## Paso 0 · Probar en tu computadora

Requisitos: Node.js 22+ y Git.

```powershell
cd C:\Scripts\Cobro
npm install
npm run setup      # crea la base local (PGlite) y datos de ejemplo
npm run dev
```

- Panel: http://localhost:3000/login (en desarrollo, sin `ADMIN_PASSWORD`, la contraseña es `admin`).
- Portal de ejemplo: http://localhost:3000/p/demo-ana (y `/p/demo-carla`, a quien tú le debes).
- Para empezar desde cero en local: borra la carpeta `.data` y corre `npm run db:migrate`.

## Paso 1 · Subir el código a GitHub

1. Crea un repositorio **privado** en GitHub (ej. `cobro`).
2. En la carpeta del proyecto:

```powershell
git add -A
git commit -m "Cobro: primera versión"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/cobro.git
git push -u origin main
```

> `.env.local` y `.data/` están en `.gitignore`: tus secretos y tu base local no se suben.

## Paso 2 · Crear la base de datos (Neon, gratis)

1. Entra a https://neon.tech e inicia sesión con GitHub.
2. *Create project* → nombre `cobro`, región **AWS US East 1 (N. Virginia)**, la misma zona que usa Vercel por defecto (`iad1`).
3. En *Connection Details* activa **Pooled connection** y copia la cadena (contiene `-pooler`). Debe terminar en `?sslmode=require`.
4. Aplica las tablas desde tu PC:

```powershell
$env:DATABASE_URL = "postgresql://usuario:clave@ep-xxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
npm run db:migrate
Remove-Item Env:DATABASE_URL
```

## Paso 3 · Generar secretos

Ejecuta dos veces y guarda los resultados (uno para `SESSION_SECRET`, otro para `CRON_SECRET`):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Elige también una `ADMIN_PASSWORD` larga (usa tu gestor de contraseñas).

## Paso 4 · Publicar en Vercel (gratis)

1. Entra a https://vercel.com con tu cuenta de GitHub → *Add New… → Project* → importa el repo `cobro`.
2. Framework: Next.js (se detecta solo). No cambies los comandos.
3. En **Environment Variables** agrega:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | la cadena *pooled* de Neon |
| `ADMIN_PASSWORD` | tu contraseña de administrador |
| `SESSION_SECRET` | secreto 1 |
| `CRON_SECRET` | secreto 2 |
| `APP_URL` | `https://TU-PROYECTO.vercel.app` (ajústalo tras el primer deploy) |
| `APP_TIMEZONE` | `America/Mexico_City` |

4. *Deploy*. Al terminar, si la URL es distinta, corrige `APP_URL` y haz *Redeploy*.
5. El archivo `vercel.json` registra el cron diario `/api/cron/daily` a las 15:00 UTC (09:00 en CDMX). Verifícalo en *Settings → Cron Jobs*. Vercel envía automáticamente el header `Authorization: Bearer $CRON_SECRET`.

## Paso 5 · Configurar la app

1. Entra a `https://TU-PROYECTO.vercel.app/login`.
2. **Ajustes**: tu nombre, datos bancarios (CLABE, banco, titular), días de recordatorio.
3. **Plataformas**: agrega Spotify, YouTube, Meli+ con su costo mensual.
4. **Personas**: agrega a cada participante con su WhatsApp (10 dígitos).
5. **Obligaciones**: para cada persona, crea sus suscripciones, MSI, préstamos o lo que tú le debes.
   - Si alguien ya tenía pagos anteriores, regístralos en **Pagos** para que el progreso sea correcto.
6. En la ficha de cada persona toca **Enviar bienvenida**: se abre WhatsApp con su enlace personal.

## Paso 6 · Notificaciones (opcional, todo gratis)

### Correo con Gmail / Google Workspace
1. Activa la verificación en dos pasos en tu cuenta de Google.
2. Crea una *contraseña de aplicación* en https://myaccount.google.com/apppasswords (en Workspace, el administrador debe permitirlo).
3. En Vercel agrega `SMTP_USER` (tu correo), `SMTP_PASS` (la contraseña de aplicación), `SMTP_FROM` (ej. `Cobro <tu@correo.com>`) y `ADMIN_EMAIL`.
4. Marca "Recordatorios por correo" en las personas que lo quieran.

### WhatsApp para ti (CallMeBot)
Sigue las instrucciones de https://www.callmebot.com/blog/free-api-whatsapp-messages/ para obtener tu *apikey* y agrega `ADMIN_PHONE` (ej. `5215512345678`) y `CALLMEBOT_APIKEY`. Recibirás el resumen diario y los avisos de comprobantes nuevos.

### WhatsApp automático con la API de Meta (tiene costo por mensaje)
1. En https://developers.facebook.com crea una app tipo *Business* y agrega el producto **WhatsApp**.
2. Registra un número (no puede ser el que usas en tu WhatsApp personal) y crea un **token permanente** de usuario del sistema.
3. Crea la plantilla `recordatorio_pago`, categoría **Utility**, idioma `es_MX`, cuerpo sugerido:
   > Hola {{1}}, tienes un saldo pendiente de {{2}}. Consulta tu detalle y sube tu comprobante aquí: {{3}}
4. Cuando la aprueben, agrega `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE` y `WHATSAPP_TEMPLATE_LANG` en Vercel.

Sin esto, los recordatorios quedan en la cola **Por enviar** del panel y los mandas con un toque.

## Paso 7 · Respaldos

- Manual: *Ajustes → Respaldo → JSON* y guárdalo en tu Google Drive.
- Automático: en GitHub → *Settings → Secrets and variables → Actions* agrega `APP_URL` y `CRON_SECRET`. El workflow `.github/workflows/backup.yml` guarda un JSON cada domingo como artefacto (90 días).

## Paso 8 · Rutina de uso

- **Diario (automático):** se generan cargos, recargos y recordatorios; te llega el resumen.
- **Cuando te avisen de un comprobante:** *Pagos → Aprobar/Rechazar* (el participante ve el resultado en su portal).
- **Si te pagan en efectivo o tú pagas:** *Pagos → Registrar pago*.
- **Si alguien te debe y tú le debes:** ficha de la persona → *Compensar*.
- **Si un enlace se filtra:** ficha → *Regenerar enlace* y envía el nuevo.

## Actualizar la app

Cualquier `git push` a `main` vuelve a desplegar. Si cambias `src/db/schema.ts`:

```powershell
npm run db:generate
```

y aplica la migración contra Neon (Paso 2.4) antes o justo después del deploy.

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| Error 500 al entrar | Falta `DATABASE_URL` o `SESSION_SECRET` (mínimo 32 caracteres) |
| "relation ... does not exist" | No corriste `npm run db:migrate` contra Neon |
| Los enlaces de WhatsApp apuntan a localhost | `APP_URL` mal configurada |
| El cron no corre | Revisa *Vercel → Settings → Cron Jobs → logs* y que exista `CRON_SECRET` |
| Comprobante rechazado por tamaño | Máximo 4 MB (las fotos se comprimen solas; los PDF no) |
