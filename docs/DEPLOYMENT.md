# Inkfinity Deployment Guide

Guía práctica para desplegar la plataforma en **Firebase App Hosting** con HTTPS y dejar funcionando la verificación facial 2FA (cámara + liveness + email link).

> **Por qué HTTPS es obligatorio:** la cámara (`getUserMedia`), la criptografía del navegador (`crypto.subtle`) y el email link de Firebase Auth solo funcionan sobre contextos seguros. `localhost` está exento (por eso `npm run dev` funciona). En un iPhone conectado por LAN con `http://192.168.x.x:9002` la cámara está bloqueado — es el error `Camera Not Supported Here`.

---

## 0. Requisitos previos

- Proyecto en Firebase: `inkfinity-2d470`
- Firebase CLI instalado: `firebase --version`
- Backend de App Hosting creado (`apphosting.yaml` ya existe en la raíz)
- Secret `GEMINI_API_KEY` creado en Google Cloud / App Hosting (ya mapeado en `apphosting.yaml`)

---

## 1. Variables de entorno de build (App Hosting)

App Hosting **no lee `.env.local`**. Las variables `NEXT_PUBLIC_*` se incrustan en el bundle en **tiempo de build**, así que deben existir en el backend antes de desplegar.

Necesarias (valores idénticos a los de `.env.local`):

| Variable | Ejemplo |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIza...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `inkfinity-2d470.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | `https://inkfinity-2d470-default-rtdb.firebaseio.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `inkfinity-2d470` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | (del proyecto) |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | (del proyecto) |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | (del proyecto) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | (del proyecto) |
| `NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS` | (address del contrato) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | 16-hex-chars del dashboard de Reown (ver §1.5 abajo) |

**Cómo configurarlas** (dos opciones):

**A. App Hosting (recomendada).**
En la consola de Firebase → App Hosting → backend → **Variables** añade cada una como **environment variable** (no secret; son públicas para el SDK web). `GEMINI_API_KEY` ya está como secret vía `apphosting.yaml`.

**B. En la interfaz web de App Hosting**, o desde CLI:

```bash
firebase apphosting:backends:update <backend> --project inkfinity-2d470
```

### 1.5 Reown AppKit / WalletConnect (billeteras móviles)

La app usa **Reown AppKit** (WalletConnect) para conectar billeteras desde Android/iOS (deep link a la app de la billetera o escaneo de QR). Necesita un **Project ID** (público por diseño, va embebido en el bundle).

**Estado:** el Project ID ya está creado y configurado en `.env.local`:

```bash
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=fedf6cd812a74a885931241545a8120d
```

Pasos para llevarlo a producción:

1. **Si algún día quisieras recrear el proyecto:** crea uno en <https://dashboard.reown.com> (rellena nombre y URL; para cloud déjalo vacío) y copia su Project ID.
2. **App Hosting** (según §1): en Firebase console → App Hosting → backend → **Variables**, añade como environment variable
   `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=fedf6cd812a74a885931241545a8120d`
   (idéntica a `.env.local`; App Hosting no lee `.env.local`).
   Desde la consola; para los antiguos backends equivale a `firebase apphosting:backends:update <backend> --project inkfinity-2d470`.
3. **Dominios permitidos en Reown**: en Reown Dashboard → tu proyecto → **App Configuration / Domains**, añade:
   - `inkfinity-2d470.web.app`
   - `ssrinkfinity2d470-no4spoqgaq-uc.a.run.app` (o el dominio de tu backend de App Hosting)
   - `localhost` (desarrollo)
   - Cualquier dominio personalizado.
4. **Desplegar** con la variable presente (paso 3 del README) para que el Project ID quede incrustado.

> El `metadata.url` de AppKit (en `src/context/appkit.tsx`) debe coincidir con tu dominio (lo usa la Verify API de Reown). Se puede sobrescribir con `NEXT_PUBLIC_SITE_URL`.

> Sin Project ID (o si se borra del env) la app **no rompe**: el botón "Connect Wallet" cae al flujo antiguo por extensiones (`window.ethereum`). Con Project ID, el modal de AppKit (QR / deep links móviles) reemplaza ese flujo automáticamente.

---

## 2. Dominios autorizados en Firebase Auth

Requisito de `sendSignInLinkToEmail` (el fallback por email link).

1. Consola de Firebase → **Authentication** → **Settings** → **Authorized domains**
2. Añade:
   - `inkfinity-2d470.web.app`
   - `inkfinity-2d470.firebaseapp.com`
   - El dominio del backend de App Hosting: `ssrinkfinity2d470-no4spoqgaq-uc.a.run.app` (o el que muestre tu backend)
   - Cualquier dominio personalizado que uses

`localhost` ya está autorizado por defecto (desarrollo).

---

## 3. Desplegar (obtener HTTPS)

App Hosting te da una URL `https://` automáticamente. Dos formas:

**Vista previa (para probar ahora en el iPhone):**

```bash
firebase apphosting:channels:deploy preview --project inkfinity-2d470
```

**Producción:**

```bash
firebase deploy --only apphosting --project inkfinity-2d470
```

Si prefieres Firebase Hosting + framework backend (`frameworksBackend` ya está en `firebase.json`):

```bash
firebase deploy --only hosting --project inkfinity-2d470
```

Tras el despliegue, abre la URL `https://` desde el iPhone y verifica:
1. Cámara activa (sin error "Camera Not Supported Here").
2. Liveness + verificación facial completa.
3. Email link de respaldo abre en otro dispositivo (el email viaja en la URL del link).

---

## 4. Verificación post-despliegue

Checklist rápido:

- [ ] `/` carga sin errores de Firebase (si Firebase no inicializó, falta el paso 1)
- [ ] `/verify-face` abre la cámara en iPhone/escritorio
- [ ] `/settings` → activar 2FA facial → registrar rostro → verificar
- [ ] Botón "Email me a secure link" envía correo y el link completa la verificación **desde otro dispositivo**
- [ ] 3 intentos fallidos activan el bloqueo (`facialAttempts` en RTDB)
- [ ] Server Actions funcionan desde el dominio desplegado (si da `Invalid Server Actions request`, revisar `serverActions.allowedOrigins` en `next.config.js`)
- [ ] Con `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` configurado: en el móvil, "Connect Wallet" abre el modal de AppKit y el deep link salta a la app de la billetera (o QR); en escritorio sigue funcionando con extensiones
- [ ] Build local no muere por memoria (si ocurre, el script `build` ya incluye `NODE_OPTIONS=--max-old-space-size=4096`)

---

## 5. Pruebas sin desplegar (HTTPS temporal)

Si aún no quieres desplegar pero necesitas HTTPS para tu teléfono:

```bash
# Con cloudflared (túnel de Cloudflare)
cloudflared tunnel --url http://localhost:9002
# Con ngrok
ngrok http 9002
```

Usa la URL `https://…` resultante en el iPhone.

---

## Notas de seguridad / deuda técnica

- `next.config.js` tiene `typescript.ignoreBuildErrors: true` y `eslint.ignoreDuringBuilds: true`. Para un feature de seguridad conviene arreglar los errores TS pre-existentes y activarlos (el build fallará si hay errores).
- El email va incrustado en la URL del link de respaldo (`?email=…`). Es seguro (el `oobCode` debe coincidir con ese email), pero si lo consideras otro punto de filtración, se puede sustituir por el flujo con `isSignInWithEmailLink` + `signInWithEmailLink` comprobando la origin.