# Troubleshooting Common Issues

This document provides solutions for common problems you might encounter while developing and running the Inkfinity platform.

---

## Camera: "Camera Not Supported Here" / "dispositivo no detectado"

### Problem
Opening a camera-based flow (profile/avatar capture) shows a camera error and no preview ever appears. On a phone (e.g. iPhone) this typically shows as "Camera Not Supported Here" or simply "no device".

### Cause
The most common cause is **opening the app over HTTP** instead of HTTPS. Browsers only expose `navigator.mediaDevices` to secure contexts (HTTPS or `localhost`). Opening `http://192.168.x.x:3000` from a phone over your LAN hits this immediately.

Other causes, in order of frequency:
1. **Insecure context (HTTP)** — `getUserMedia` is not available at all.
2. **Camera permission denied** — by the browser (site settings) or by the OS (macOS System Settings → Privacy & Security → Camera; Windows Settings → Privacy → Camera).
3. **Camera already in use** — another application (video call, etc.) holds the device.

### Solution
- Use **HTTPS**: production is already on Vercel (`https://inkfinity-ten.vercel.app`), or run `cloudflared tunnel --url http://localhost:3000` / `ngrok http 3000` and open the `https://` URL on the phone (see `docs/DEPLOYMENT.md`).
- Check the browser/OS camera permissions and reload the page.
- Close apps using the camera.
- Uses `src/lib/client/camera.ts`, which detects the specific cause and surfaces a targeted message. Read the banner text: it tells you which of the cases above it is.

---

## "Invalid Server Actions request" on the deployed site

### Problem
Server actions (`geocodeAddress`, `generateArtworkDetails`, etc.) are rejected with a `Next 400 / Invalid Server Actions request` error only on the deployed domain (works on `localhost`).

### Cause
Next.js only accepts Server Action requests from origins listed in `serverActions.allowedOrigins` in `next.config.js`. The deployed domain is missing.

### Solution
Add the production origin(s) to `serverActions.allowedOrigins` in `next.config.js`. As of this writing the list already includes `inkfinity-ten.vercel.app` and `*.vercel.app`:

```js
serverActions: {
  allowedOrigins: ["inkfinity-ten.vercel.app", "*.vercel.app", "localhost:3000"],
},
```

Then rebuild and redeploy — changing `next.config.js` always requires a **rebuild**, not just a redeploy.

---

## WalletConnect / Reown "Origin Not Allowed" Error (obsoleto)

### Problem
Al conectar una wallet externa aparecía `WebSocket connection closed abnormally with code: 3000 (Unauthorized: origin not allowed)`.

### Cause / Solution
**Esta sección ya no aplica: WalletConnect/Reown (AppKit) fue eliminado por completo** para dejar **únicamente el pago nativo con Worldcoin (WLD) vía MiniKit dentro de la World App** (ver `src/context/wallet-provider.tsx` y `src/lib/world-app.ts`). Ya no hay proyecto de Reown, ni `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, ni allowlist de dominios de Reown.

Si vuelve a aparecer un error de conexión de wallet, revisa en su lugar:
- Que la app se abra **dentro de la World App** para el flujo MiniKit (el `domain`/`uri` del SIWE derivan de `window.location`).
- Que el dominio esté registrado en el **World Developer Portal** (ver `docs/DEPLOYMENT.md` §1.6).

---

## Firebase no conecta en producción: CSP bloquea `*.firebaseio.com`

### Problem
En producción (Vercel) el usuario inicia sesión pero **los datos no cargan** y en la consola aparece un error tipo:

```
Loading the script 'https://inkfinity-2d470-default-rtdb.firebaseio.com/.lp?start=t&ser=...&cb=...&v=5' violates the following Content Security Policy directive: "script-src ..."
```

### Cause
Firebase **Realtime Database** usa *JSONP long-polling*: inyecta `<script src="https://<proj>-default-rtdb.firebaseio.com/.lp?...">`. Si `script-src` en la CSP **no** incluye `https://*.firebaseio.com`, todos los `<script>` de RTDB se bloquean y la conexión a la base de datos falla (no hay datos de usuario, se cierra la sesión aparentemente).

### Solution
En `next.config.js` → `headers()` → `Content-Security-Policy`, añade en `script-src`:

```
https://*.firebaseio.com
```

Y en `connect-src` (además del long-polling):

```
https://*.firebaseio.com wss://*.firebaseio.com
```

En `frame-src` añade también `https://*.firebaseio.com`. Cambiar `next.config.js` **requiere rebuild** (no basta con redeploy). Ver la sección CSP de `docs/DEPLOYMENT.md` para la política completa que necesita Auth + RTDB.

---

## La ubicación del usuario no funciona (`Location not allowed`)

### Problem
El ordenado de obras por cercanía en `/`, y el uso de geolocalización en `/settings` y `/search`, no obtienen la posición.

### Cause
`Permissions-Policy` enviaba `geolocation=()`, lo que **deshabilita** la Geolocation API para el propio origen.

### Solution
En `next.config.js`, el header `Permissions-Policy` debe usar `geolocation=(self)` (no `geolocation=()`):

```
camera=(self), microphone=(self), geolocation=(self), interest-cohort=()
```

Cambiar `next.config.js` requiere **rebuild**.

---

## World ID: `WORLDID_UNAVAILABLE`

### Problem
"Verify with World ID" always fails with `WORLDID_UNAVAILABLE`, or the button reports that verification is temporarily unavailable.

### Cause
One of:
- `RP_SIGNING_KEY` is not set in the deployment. World ID 4.0 rejects unsigned requests, so the flow cannot be downgraded to unsigned.
- `WORLD_RP_ID` is missing or does not start with `rp_` (it is rejected by `getWorldIdRpId`).
- `NEXT_PUBLIC_WORLD_APP_ID` is missing or does not start with `app_`; the client refuses before contacting IDKit.
- World ID's verifier was unreachable, timed out (20s), returned `404` (app not found or not yet migrated to 4.0), `429`, or a `5xx`.

### Solution
This error is deliberately **not** a rejection: it means the app could not check, so it fails closed instead of marking a real person as a bot. Check, in order:
1. `RP_SIGNING_KEY` and `WORLD_RP_ID` exist in Vercel (both server-side) and `NEXT_PUBLIC_WORLD_APP_ID` is a public build-time value.
2. In the World Developer Portal, confirm the app has completed **Enable World ID 4.0** (RP registration). Until then the verifier answers `app_not_migrated` with `404`.
3. The `signing_key` shown in the Portal is the one configured in `RP_SIGNING_KEY`; if it ever leaked, rotate it there — clients must never hold it.
4. Retry. Nothing is persisted on failure, so a successful retry links normally.

Referencia completa (Developer Portal, acciones y entorno): `docs/WORLD_ID.md`.

## World ID: `409` "already linked to another account"

### Problem
Linking returns `409` even though the person believes they never verified before.

### Cause
`worldId_nullifiers/<nullifier>` is already claimed by a different Firebase uid. The claim is keyed by the (app, action) nullifier, so it is stable per human for the `inkfinity-account` action: verifying again with the same account is fine, but the same World ID cannot be attached to two accounts.

### Solution
Sign in with the original account. If the original account is inaccessible, this needs a manual review: the raw nullifier is deliberately not stored in the (publicly readable) profile, so support must read `worldId_nullifiers` with the Admin SDK rather than asking the user for it.

## World ID: probar sin un Orb físico (simulador)

### Problem
No tienes un Orb y quieres probar el flujo de World ID de extremo a extremo.

### Cause
El simulador de World ID emite proofs del entorno `staging`, que **no** representan a una persona real.

### Solution
1. Añade `WORLD_ID_ENVIRONMENT=staging` en el entorno local (y en Vercel solo si es un despliegue de pruebas descartable).
2. El servidor publica `environment` en `/api/worldid/rp-context` y el cliente lo usa tal cual: no está fijado en el código.
3. El servidor rechaza con `WORLDID_ENVIRONMENT_MISMATCH` cualquier proof cuyo entorno no coincida con el suyo, así que un simulator no puede colarse como humano en producción.
4. **No dejes `staging` en producción**: quien tenga el simulador podría marcarse como verificado.

## El registro de usuario falla con `PERMISSION_DENIED`

### Problem
Tras desplegar las reglas nuevas, crear una cuenta devuelve `PERMISSION_DENIED`.

### Cause
`users/<uid>` depende de varias reglas `.validate`. Si el perfil se crea con un campo que el servidor considera exclusivo suyo (por ejemplo `paymentDate`, `referredBy` o un `referralCodeUsed` distinto de `false`), el alta se rechaza.

### Solution
Los campos inicializadores que el cliente sí puede escribir en el alta están permitidos explícitamente: `role` (solo los cuatro roles no privilegiados), `status` (`active` / `pending_verification` / `pending_payment`) y `referralCodeUsed: false`. Cualquier otro valor es de solo servidor (Admin SDK, que ignora las reglas). Si un flujo legítimo nuevo necesita escribir otro campo, añádelo como rama de creación en su `.validate` y con un test en `scripts/test-booking-rules.mjs`.
