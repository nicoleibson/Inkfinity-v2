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
    *   Find the section named **Allowed Domains** (o **Allowed Origins**).
    *   Añade `inkfinity-ten.vercel.app` y, si pruebas en otro host, también ese host (ej. el dominio de un túnel).

5.  **Add Localhost (Recommended):** While you are here, it's a good idea to also add your local development URL so you can run the project on your own machine in the future:
    ```
    localhost:3000
    ```

6.  **Save and Refresh:** Save the changes on the Reown dashboard. Then, return to your development workspace tab and **refresh the page**. The wallet connection should now work correctly.

> Si el error aparece solo en un túnel puntual (cloudflared/ngrok), el dominio cambia en cada lanzamiento: añade el host de ese túnel o usa el flujo sin Project ID (que cae a `window.ethereum`, sin requerír de Reown).

---

## "no such account" al enviar una transacción (web / MetaMask)

### Problem
`BrowserProvider` / `JsonRpcSigner` lanza `no such account` (o `could not coalesce error`) al firmar, aunque la wallet esté conectada y con saldo.

### Cause
El navegador puede exponer varias cuentas (`eth_accounts`) mientras `ethers` tiene cacheada otra distinta, o la cuenta cacheada pertenece a una red diferente a la esperada.

### Solution
Pasa siempre la dirección explícitamente al pedir el signer:

```ts
const signer = provider.getSigner(walletAddress ?? undefined);
```

Este patrón ya está aplicado en `src/components/payment/payment-form.tsx` y en los flujos de depósito/reembolso de `src/components/bookings/booking-list.tsx`. Si reintroduces un `getSigner()` sin argumento, el bug vuelve a aparecer.

---

## World App: la conexión falla o el SIWE se rechaza

### Problem
Dentro de la World App, "Connect Wallet" no conecta, o MiniKit lanza un error de dominio / challenge inválido.

### Cause
1. **Dominio no registrado en el Developer Portal.** MiniKit deriva el `domain` y el `uri` del SIWE de `window.location`. Si el host actual no está en la allowlist de tu app, la World App rechaza la firma.
2. **App ID ausente o incorrecto.** `MiniKit.install()` necesita `NEXT_PUBLIC_WORLD_APP_ID`; si falta, la inicialización falla y el provider no queda disponible.
3. **Falta el rebuild.** Las variables `NEXT_PUBLIC_*` se incrustan en build: añadirlas en Vercel no cambia nada hasta redesplegar.
4. **No estás dentro de la World App.** `isInWorldApp()` es false en un navegador normal; ahí el flujo correcto es AppKit, no MiniKit.

### Solution
- Registra `inkfinity-ten.vercel.app` en <https://developer.world.org> para el app de `NEXT_PUBLIC_WORLD_APP_ID`.
- Confirma que `NEXT_PUBLIC_WORLD_APP_ID` está definida en Vercel y **rebuild**.
- Para probar en local, `localhost` suele requerir una app de desarrollo habilitada en el portal.
- Diagnóstico: dentro de la World App debe existir `window.WorldApp` y el badge de red debe mostrar **WorldChain / WLD**.

---

## World App: el pago devuelve `userOpHash` y la verificación no completa

### Problem
El pago se firma correctamente en la World App, pero la membresía o la reserva no se activan, o el servidor responde `202`.

### Cause
Dentro de la World App los pagos son **ERC-4337 userOperations**: `MiniKit.sendTransaction` devuelve un `userOpHash` (no un `txHash`) y no se puede hacer `tx.wait()`. La resolución se hace contra:

```
GET https://developer.world.org/api/v2/minikit/userop/{userOpHash}
```

que responde `pending`, `failed` o un `transaction_hash` final. Además, las transacciones ERC-4337 apuntan al **EntryPoint** con `value = 0`, así que validar el `tx.to` / `tx.value` de la transacción superior **no** describe lo que el usuario firmó.

### Solution / estado actual
Los pagos se verifican server-side; la implementación ya no tiene los fallos descritos arriba. Para diagnóstico:

- `/api/verify-payment` y `/api/verify-booking-payment` responden:
  - `202` + `TX_PENDING` → aún no confirmada. **El cliente reintenta solo** (polling); si ves este toast, la transferencia sí salió, no vuelvas a pagar. Las userOps también necesitan 5 confirmaciones, así que esta respuesta es normal en los primeros segundos.
  - `409` + `PAYMENT_ALREADY_USED` → otro usuario (u otra reserva) canjeó ese pago. Si es el **mismo** usuario y la misma reserva, la respuesta es un éxito idempotente, no un error: reintentar es seguro.
  - `422` + `WRONG_RECIPIENT` / `INSUFFICIENT_VALUE` → el pago no coincide con lo esperado.
  - `422` + `WRONG_SENDER` → el pago salió de una wallet que no es la registrada en la cuenta. Suele ser la wallet equivocada en el perfil, no un intento de fraude: corrige `walletAddress` y vuelve a pagar.
  - `422` + `MISSING_PAYER_WALLET` → la cuenta (o la reserva) no tiene `walletAddress` registrado. El servidor falla en cerrado en vez de adivinar: rellénalo en Ajustes antes de pagar.
  - `422` + `SENDER_UNKNOWN` → no se pudo determinar quién envió el pago; no se liquida.
  - `422` + `USEROP_UNVERIFIABLE` → el bundler devolvió una userOp que no corresponde al hash declarado.
  - `502` + `USEROP_LOOKUP_FAILED` → no se pudo contactar con el Developer Portal.
  - `503` + `PRICE_UNAVAILABLE` → falta precio de referencia; no se liquida el depósito.
  - `401` + `UNAUTHENTICATED` → sesión Firebase caducada o el cliente no envió el token.

- **Si los pagos de la World App se rechazan sistemáticamente**, revisa `RPC_WORLDCHAIN_BUNDLER_URL`. Sin bundler se usa el delta de saldo del receptor en el bloque de liquidación (correcto, pero conservative). Un bundler mal configurado hace *peor* la verificación: el código recalcula el `userOpHash` y rechaza cualquier respuesta que no coincida.

- **Si el toast dice "Still Confirming"** y nunca se activa: la transacción quedó pendiente o el servidor no alcanza a confirmarla. No reintentes el pago; comprueba el `userOpHash` en WorldScan.

> No resuelvas userOperations con un RPC público: los RPC públicos de WorldChain rechazan `eth_getUserOperationByHash` (Alchemy responde `401: Only core evm requests are allowed.`).

---

## 401 `UNAUTHENTICATED` al confirmar un pago

### Problem
El pago se envió pero el servidor responde `401` con `UNAUTHENTICATED`.

### Cause
Los endpoints de verificación usan el Admin SDK (que ignora `database.rules.json`), así que exigen `Authorization: Bearer <Firebase ID token>`. Si la sesión caducó, el `getIdToken()` devuelve un token inválido o no hay usuario.

### Solution
- El cliente obtiene el token de `auth.currentUser.getIdToken()`. Si el usuario no ha iniciado sesión, no se puede liquidar nada: eso es intencionado.
- Tras un `firebase login`/`logout` o un refresh de token caducado, reintenta la confirmación; **no** pagues de nuevo.

---

## La reserva no se confirma aunque la transferencia se hizo

### Problem
El depósito se envió al wallet del artista pero la reserva sigue en `awaiting_payment`.

### Cause
El estado ya no lo escribe el cliente: `/api/verify-booking-payment` lo cambia solo tras probar la transferencia on-chain. Si la regla de la base de datos no está desplegada, o si la verificación falla, la reserva se queda como está.

### Solution
1. Despliega las reglas: `firebase deploy --only database --project inkfinity-2d470` (ver `docs/DEPLOYMENT.md` §5.2). Las reglas nuevas bloquean los campos de pago y el paso a `confirmed` desde el navegador.
2. Comprueba la respuesta del endpoint en la consola del navegador: si es `422 INSUFFICIENT_VALUE`, el importe enviado quedó por debajo del mínimo tolerado (10% de margen sobre el precio de referencia). Si es `503 PRICE_UNAVAILABLE`, falta `PRICE_API_BASE_URL`.
3. Verifica que el `depositAmount` de la reserva no se haya modificado: las reglas ya no permiten bajarlo.
