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

## WalletConnect "Origin Not Allowed" Error

### Problem
When you try to connect your wallet, the connection fails, and you see an error in the browser's console that looks like this:

`Error: WebSocket connection closed abnormally with code: 3000 (Unauthorized: origin not allowed)`

### Cause
This is a security feature from the WalletConnect cloud service, not a bug in the application code. Your project on their platform will only accept connection requests from domains (also called "origins") that you have explicitly approved. Because your development environment runs on a dynamic URL, you must add it to the allowlist.

### Solution
Follow these steps to add the current URL to your Reown project's allowlist:

1.  **Go to the Reown Dashboard:** Open a new browser tab and navigate to [https://dashboard.reown.com/](https://dashboard.reown.com/).

2.  **Select Your Project:** Log in and select the project for this application (project ID `fedf6cd812a74a885931241545a8120d`).

3.  **Go to App Configuration:** Open **App Configuration → Domains** (este es el allowlist de Reown).

4.  **Add the Origin URL:**
    *   For local development: add `http://localhost:3000` (or whatever port you use).
    *   For production: add `https://inkfinity-ten.vercel.app`.
    *   If you use preview deployments (Vercel preview URLs), add the pattern `*.vercel.app` to cover all preview deployments automatically.

5.  **Save Changes:** Click **Save** or **Apply**.

6.  **Test:** Reload your application and try connecting your wallet again. The error should be gone.

> **Note:** If you are using a preview deployment (e.g., `inkfinity-git-feature-xyz.vercel.app`), the `*.vercel.app` wildcard in step 4 will cover it. You only need to add specific URLs for custom domains.

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

## Verificación Facial: Bypass tras verificación exitosa (solucionado)

### Problema
Tras completar la verificación facial en `/verify-face`, el usuario es redirigido a la página objetivo (ej. `/`) pero es inmediatamente redirigido de vuelta a `/verify-face` en bucle. La verificación facial pareció exitosa, pero el middleware seguía bloqueando el acceso.

### Causa
La verificación facial actualiza correctamente el custom claim `faceVerified` en Firebase Auth, y el cliente llama a `getIdToken(true)` para refrescar el ID token. Sin embargo, la cookie de sesión (`__session`) que usa el middleware **no se actualiza automáticamente** cuando cambian los custom claims. La cookie solo se refresca en el próximo login o cuando se refresca explícitamente vía `/api/auth/session`. Esto crea una ventana donde el usuario tiene los custom claims actualizados en su ID token (en memoria), pero el middleware sigue viendo la cookie de sesión antigua sin el claim `faceVerified`, por lo que redirige de vuelta a `/verify-face`.

### Solución
Se implementó una **cookie dedicada `face_verified`** que se setea inmediatamente en el cliente tras la verificación exitosa:

1. **Cliente setea cookie inmediatamente** (`src/components/auth/face-verifier.tsx`):
   ```js
   document.cookie = 'face_verified=true; path=/; max-age=3600; sameSite=lax';
   ```

2. **Middleware verifica ambas fuentes** (`src/middleware.ts`):
   - Verifica el custom claim `faceVerified` de la cookie de sesión (vía `/api/auth/verify-session`)
   - **También** verifica la cookie dedicada `face_verified` directamente: `request.cookies.get('face_verified')?.value === 'true'`
   - Cualquier fuente permite el acceso: `faceVerifiedFlag = faceVerified === true || faceVerifiedCookie`

3. **Logout limpia la cookie** (`src/app/verify-face/page.tsx`):
   ```js
   document.cookie = 'face_verified=; path=/; max-age=0; sameSite=lax';
   ```

**Propiedades de la cookie:** `face_verified=true; path=/; max-age=3600; sameSite=lax` (TTL 1h, coincide con TTL del custom claim).

### Verificación
Tras el fix, el flujo es:
1. Usuario completa verificación facial en `/verify-face`
2. Cliente setea cookie `face_verified=true` inmediatamente
3. Cliente llama `/api/auth/face-verified` para setear custom claim (async)
5. Cliente llama `/api/auth/session` para refrescar cookie de sesión (opcional, para propagar claim)
6. Redirige a página objetivo
6. Middleware ve cookie `face_verified` → **permite acceso inmediatamente**

Esto elimina la condición de carrera por completo, ya que la cookie se setea síncronamente en el navegador antes de la redirección.