# Troubleshooting Common Issues

This document provides solutions for common problems you might encounter while developing and running the Inkfinity platform.

---

## Camera: "Camera Not Supported Here" / "dispositivo no detectado"

### Problem
Activating facial verification shows a camera error and no preview ever appears. On a phone (e.g. iPhone) this typically shows as "Camera Not Supported Here" or simply "no device".

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
- Uses `src/lib/client/camera.ts`, which detects the specific cause and shows a **targeted toast + persistent banner with a "Try Again" button** (`face-verifier.tsx`, `settings/page.tsx`). Read the banner text: it tells you which of the cases above it is.

---

## Email link fallback: "No pending email found" / invalid link

### Problem
Clicking "Email me a secure link" and then the emailed link shows an error on `/verify-face/email-link`.

### Cause / Solution
1. **Domain not authorized:** `sendSignInLinkToEmail` requires the app to run on an **authorized domain** (Firebase Console → Authentication → Settings → Authorized domains). Add `inkfinity-ten.vercel.app`.
2. **Different device/browser:** the legacy flow required the same browser tab (email stored in `localStorage`). This is now **supported**: the email is embedded in the link URL, so opening it on another device works — as long as account settings match and the link is fresh.
3. **Already-verified session:** if the login was already completed, the link is single-use. Request a new one from `/verify-face`.

---

## "Invalid Server Actions request" on the deployed site

### Problem
Server actions (`verifyFace`, `geocodeAddress`) are rejected with a `Next 400 / Invalid Server Actions request` error only on the deployed domain (works on `localhost`).

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

En `frame-src` añade también `https://*.firebaseio.com`. Cambiar `next.config.js` **requiere rebuild** (no basta con redeploy). Ver `docs/FACIAL_VERIFICATION.md` §9 para la CSP completa que necesita Auth + RTDB.

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

---

## Verificación Facial: bucle de redirección a `/verify-face` tras verificar

### Problema
Tras completar la verificación facial, el usuario es redirigido a la página objetivo (ej. `/`) pero el middleware lo devuelve inmediatamente a `/verify-face`, en bucle.

### Causa
Los custom claims (`faceVerified`, `faceVerifiedAt`) se actualizan en Firebase Auth, pero la cookie `__session` que consume la verificación de sesión no incorpora el claim automáticamente. Sin embargo, el middleware **no depende solo del claim**: aplica el requisito firmado (`face_req_signed`) y el grant firmado (`face_verified_signed`).

### Solución (implementación actual)
El grant se transporta en una **cookie httpOnly firmada con HMAC** (`face_verified_signed`), emitida por el servidor en `POST /api/auth/face-verified` **solo tras reverificar el rostro** contra el scan de la base de datos, y atada al `uid`:

1. **Servidor emite el grant** (`src/app/api/auth/face-verified/route.ts`): `setCustomUserClaims(uid, { faceVerified: true, faceVerifiedAt })` + cookie `face_verified_signed` (httpOnly, `secure` en prod, `sameSite=lax`, `path=/`, TTL 1 h).
2. **El cliente refresca la sesión** (`src/app/verify-face/page.tsx`): tras el éxito, `auth.currentUser.getIdToken(true)` y luego `POST /api/auth/session` para volcar el claim en `__session`; después `router.push(redirect)`.
3. **Middleware valida ambos** (`src/middleware.ts`):
   - `face_req_signed` (¿este usuario requiere 2FA?) y `face_verified_signed` (¿grant válido y del mismo `uid`?).
   - Además consulta `/api/auth/verify-session` (que ahora lee la sesión por el header `Authorization: Bearer`, no por query param) y comprueba `faceVerifiedAt` contra la ventana de 1 h.
   - Un grant de **otro** `uid` **no** satisface el requisito.
4. **Logout limpia el grant**: `POST /api/auth/logout` borra `__session` y las cookies firmadas `face_req_signed` / `face_verified_signed`.

> **Nota histórica:** versiones anteriores usaban una cookie `face_verified=true` **escrita por el cliente** (`document.cookie`). Ese diseño era **forjable** y fue reemplazado por el grant HMAC httpOnly descrito arriba. No reintroducir la cookie de cliente.

### Verificación
1. Verificación OK en `/verify-face` → el servidor responde `200 { success: true, confidence >= 0.92 }` y setea `face_verified_signed`.
2. El cliente refresca `__session` con `getIdToken(true)`.
3. `router.push(redirect)`; el middleware ve `face_verified_signed` válido + mismo `uid` → **permite el acceso**.
4. Tras 1 h, el middleware redirige a `/verify-face?expired=true` para reverificar.

Detalle completo del contrato y de los umbrales en `docs/FACIAL_VERIFICATION.md`.