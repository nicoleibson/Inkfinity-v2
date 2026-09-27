# Inkfinity Deployment Guide

Guía práctica para desplegar la plataforma en **Vercel** (hosting web) con **Firebase** como backend de datos/auth, y dejar funcionando la verificación facial 2FA (cámara + liveness + email link) y los pagos en WorldChain.

> **Arquitectura de despliegue actual:**
> - **Vercel** → aplicación Next.js (`https://inkfinity-ten.vercel.app`). Es el único hosting válido.
> - **Firebase** → Authentication, Realtime Database y las *security rules* de DB/Storage. **No** sirve el web app.
> - El bloque `hosting` que sigue en `firebase.json` es legacy: **no** ejecutar `firebase deploy --only hosting`.

> **Por qué HTTPS es obligatorio:** la cámara (`getUserMedia`), la criptografía del navegador (`crypto.subtle`), el SIWE de World App y el email link de Firebase Auth solo funcionan sobre contextos seguros. `localhost` está exento (por eso `npm run dev` funciona). En un iPhone conectado por LAN con `http://192.168.x.x:3000` la cámara está bloqueada — es el error `Camera Not Supported Here`.

---

## 0. Requisitos previos

- Node.js con el repo clonado y `npm install` ejecutado.
- Proyecto de Firebase: `inkfinity-2d470` (ver `.firebaserc`).
- Firebase CLI: `firebase --version` (solo para las rules).
- Proyecto en **Vercel** conectado al repo, con el dominio canónico `inkfinity-ten.vercel.app` asignado.
- App creada en <https://developer.world.org> si se quiere usar World App / MiniKit.
- WorldChain Mainnet como red de producción en `platform_settings` (ver §5).

---

## 1. Variables de entorno (Vercel)

Vercel **no lee `.env.local`**. Las variables `NEXT_PUBLIC_*` se incrustan en el bundle en **tiempo de build**, así que deben existir en el proyecto **antes** de desplegar.

Configúralas en **Vercel → Project → Settings → Environment Variables**, marcadas para **Production**, **Preview** y **Development**:

| Variable | Scope | Valor / Ejemplo |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | public | `https://inkfinity-ten.vercel.app` |
| `NEXT_PUBLIC_WORLD_APP_ID` | public | `app_...` (Developer Portal) |
| `WORLD_RP_ID` | server | `rp_...` (solo World ID / IDKit) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | public | `AIza...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | public | `inkfinity-2d470.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | public | `https://inkfinity-2d470-default-rtdb.firebaseio.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | public | `inkfinity-2d470` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | public | (del proyecto) |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | public | (del proyecto) |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | public | (del proyecto) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | public | (del proyecto) |
| `NEXT_PUBLIC_GEMINI_API_KEY` | public | (del proyecto) |
| `NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS` | public | wallet de tesorería **en WorldChain** |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | public | 16-hex-chars del dashboard de Reown (§1.5) |
| `PLATFORM_WALLET_ADDRESS` | server | misma wallet; fallback del público |
| `RPC_WORLDCHAIN_URL` | server | RPC de WorldChain mainnet (ver `route.ts` para fallbacks) |
| `RPC_WORLDCHAIN_SEPOLIA_URL` | server | RPC de WorldChain Sepolia (opcional) |
| `RPC_WORLDCHAIN_BUNDLER_URL` | server | **bundler** para verificar `to`/`value` exactos de una userOp |
| `PRICE_API_BASE_URL` | server | fuente de precio para depósitos en USD (default: CoinGecko) |
| `ALLOW_MOCK_PRICES` | server | `true` solo en local; habilita el precio fijo heredado |
| `FIREBASE_CLIENT_EMAIL` | server | service account para escrituras admin en RTDB |
| `FIREBASE_PRIVATE_KEY` | server | clave privada del service account (con `\n` literales) |
| `GEMINI_API_KEY` | server | Genkit AI |

> **Importante:** añadir una variable nueva a un proyecto ya desplegado **no** la hace disponible en el bundle sin un **rebuild**. Tras cambiar cualquier `NEXT_PUBLIC_*`, redeploy (rebuild), no basta con un restart.

> **Las URLs de Firebase no son de hosting.** `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` y `..._DATABASE_URL` apuntan a `firebaseapp.com` / `firebaseio.com` a propósito; no se cambian al migrar a Vercel.

### 1.5 Reown AppKit / WalletConnect (billeteras móviles)

Se usa **Reown AppKit** (WalletConnect) para conectar billeteras desde Android/iOS (deep link o QR). El Project ID es público por diseño (va embebido en el bundle).

1. Crear el proyecto en <https://dashboard.reown.com> (nombre y URL; para cloud déjalo vacío) y copiar su Project ID.
2. Añadir `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` en Vercel (ver §1) y **rebuild**.
3. **Dominios permitidos en Reown** (Reown Dashboard → proyecto → *App Configuration / Domains*):
   - `inkfinity-ten.vercel.app`
   - `localhost` (desarrollo)
   - Cualquier dominio personalizado adicional.
4. El `metadata.url` de AppKit (`src/context/appkit-bridge.tsx`) usa `NEXT_PUBLIC_SITE_URL`; debe coincidir con el dominio desplegado porque la Verify API de Reown lo compara.

> Sin Project ID la app **no rompe**: "Connect Wallet" cae al flujo por extensiones (`window.ethereum`).

### 1.6 Worldcoin Developer Portal (World App / MiniKit)

Para que la app funcione **dentro de la World App**:

1. En <https://developer.world.org>, usar la app asociada a `NEXT_PUBLIC_WORLD_APP_ID`.
2. **Registrar el dominio canónico `inkfinity-ten.vercel.app`** en la lista de dominios/allowlist de la app. MiniKit deriva el `domain` y el `uri` del SIWE de `window.location`, y la World App rechaza cualquier dominio no registrado. Sin este paso el login SIWE falla aunque el código sea correcto.
3. Habilitar las capacidades necesarias: **MiniKit (walletAuth)**, envío de transacciones y `sendTransaction`.
4. Si se usa World ID / IDKit, registrar también el `rp_id` (`WORLD_RP_ID`).

Ver `docs/ADVANCED_INTEGRATIONS.md` para el flujo de userOperations y `docs/TROUBLESHOOTING.md` para errores típicos de SIWE.

---

## 2. Dominios autorizados en Firebase Auth

Requisito de `sendSignInLinkToEmail` (fallback por email link).

1. Consola de Firebase → **Authentication** → **Settings** → **Authorized domains**
2. Añade `inkfinity-ten.vercel.app` (y cualquier dominio personalizado que uses).
3. `inkfinity-2d470.web.app` y `inkfinity-2d470.firebaseapp.com` pueden permanecer por compatibilidad, pero ya no sirven la web app.

`localhost` ya está autorizado por defecto (desarrollo).

---

## 3. Desplegar (obtener HTTPS)

El deploy web es **Vercel**, no Firebase. Next.js se auto-detecta; el script `build` del repo ya sube la memoria (`NODE_OPTIONS='--max-old-space-size=1536'`) porque el bundle (AppKit + MiniKit) es pesado.

**Opción A — Git (recomendada):** conectar el repo en Vercel con el branch `main`. Cada push dispara build y deploy; los domains se asignan en *Project → Settings → Domains*.

**Opción B — CLI de Vercel:**

```bash
npm i -g vercel
vercel link
vercel env pull .env.local   # opcional: trae las vars del proyecto
vercel --prod
```

> **No** añadir un `vercel.json` con `buildCommand` / `installCommand` / `cleanUrls` a mano: sobreescribe la configuración del proyecto y puede romper el deploy. Si el build se queda sin memoria, súbelo en *Project → Settings → Environment Variables* con `NODE_OPTIONS=--max-old-space-size=4096`.

**Reglas de Firebase (independientes del hosting):**

```bash
firebase deploy --only database --project inkfinity-2d470
firebase deploy --only storage  --project inkfinity-2d470
```

---

## 4. Verificación post-despliegue

- [ ] `https://inkfinity-ten.vercel.app` carga sin errores de Firebase.
- [ ] `/verify-face` abre la cámara en iPhone/escritorio.
- [ ] `/settings` → activar 2FA facial → registrar rostro → verificar.
- [ ] "Email me a secure link" envía correo y el link completa la verificación **desde otro dispositivo**.
- [ ] 3 intentos fallidos activan el bloqueo (`facialAttempts` en RTDB).
- [ ] **Server Actions funcionan** desde el dominio desplegado. Si aparece `Invalid Server Actions request`, falta el dominio en `experimental.serverActions.allowedOrigins` de `next.config.js` (ahí debe estar `inkfinity-ten.vercel.app`).
- [ ] "Connect Wallet" en móvil abre el modal de AppKit con deep link o QR (si `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` está definido).
- [ ] La red efectiva es **WorldChain Mainnet** (símbolo WLD) en `/admin` y en el badge del navbar.
- [ ] `/api/ipfs` genera metadatos con `external_url` = `https://inkfinity-ten.vercel.app`.
- [ ] Dentro de la World App: la conexión pide firma SIWE y el pago devuelve `userOpHash`.

---

## 5. Red de producción: WorldChain Mainnet

La red se controla con `platform_settings.network` en Realtime Database (el valor guardado **prevalece** sobre el default del código):

- `/admin` → *Platform Settings* → **Network = WorldChain Mainnet** → Save.
- Default en `src/hooks/usePlatformSettings.ts`: `worldchain`.
- Redes soportadas: `worldchain` (480, producción), `worldchainSepolia` (4801, pruebas), `polygon`, `amoy`.
- Token nativo: **WLD** en WorldChain, MATIC en Polygon/Amoy.

> `NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS` debe ser una dirección **existente y con saldo en WorldChain**; si no, los pagos revertirán. Verifícala en <https://worldscan.org>.

### 5.1 Verificación de pagos (importante)

Los pagos se verifican **server-side** en `/api/verify-payment` (membresías) y
`/api/verify-booking-payment` (depósitos y reembolsos de reservas). Detalles del diseño en
`docs/ADVANCED_INTEGRATIONS.md`.

Para que funcionen correctamente en producción:

1. **`RPC_WORLDCHAIN_BUNDLER_URL`** — endpoint de un bundler que soporte
   `eth_getUserOperationByHash`. Los RPC públicos de WorldChain lo rechazan
   (`401: Only core evm requests are allowed.`) y no hay bundler público para World Chain.
   Sin esta variable la app **funciona**, pero los pagos de la World App se validan con un
   chequeo de delta de saldo del receptor en lugar de `to`/`value` exactos (más conservador,
   igual de sound). Configúrala para obtener la prueba exacta.
2. **`PRICE_API_BASE_URL`** — fuente de precio para los depósitos de reserva (denominados en
   USD). Si el servidor no consigue precio, responde `PRICE_UNAVAILABLE` y **no** liquida el
   depósito. Default: CoinGecko simple price.
3. **No** pongas `ALLOW_MOCK_PRICES=true` en producción: habilita el precio fijo heredado.

> Las membresías se cobran en unidades cripto directamente configuradas en `platform_settings`, así que no necesitan fuente de precio.

### 5.2 Desplegar las reglas de base de datos

`database.rules.json` incluye las reglas que impiden liquidar pagos desde el navegador
(`paymentTxHash`, `cancellationTxHash`, `depositConfirmedAt`, `refundConfirmedAt`,
`depositAmount` y el paso a `status: 'confirmed'`). **Sin desplegarlas, la verificación
server-side es evadible.** Requieren credenciales válidas del Firebase CLI:

```bash
firebase login --reauth
firebase deploy --only database --project inkfinity-2d470
```

> Para probar las reglas localmente hace falta Java (emulador de RTDB). Con Java instalado:
>
> ```bash
> npm run test:rules    # = firebase emulators:exec --only database "node scripts/test-booking-rules.mjs"
> ```
>
> Son 27 asserts que comprueban, **con el mismo patrón de escritura que usa la app**
> (`update(ref(db), { '/bookings/...': ... })`), que un cliente o un artista no pueden
> liquidar una reserva por su cuenta, no pueden escribir ni borrar los campos de
> liquidación, no pueden bajar `depositAmount`, y que los flujos legítimos (crear reserva,
> cancelar, aceptar, subir el depósito) siguen funcionando. Un PATCH en `/bookings` se
> evalúa de forma distinta a uno en `/bookings/<id>`: probar con la ruta equivocada da
> falsos negativos, así que no edites las rutas de los asserts sin comprobar los
> `update(` del código de la app.

#### Bugs que encontró este test

- **Crear una reserva estaba denegado.** `$bookingId` usaba solo `data.child('clientId')`,
  y en un nodo nuevo `data` es `null`, así que nadie podía crear una reserva. Ahora la
  regla comprueba `newData` (creación) y `data` (actualización).
- **Tres reglas de referidos no podían evaluarse.** Contenían
  `newData.child('$uid')`: no se puede llamar `.child()` a un string, y `$` no es válido
  dentro de una ruta. RTDB rechazaba el ruleset entero al parsearlo, así que ninguna regla
  del fichero era aplicable. Esos campos (`referralCodeOwned`, `referralCodeCorrect`) no los
  usa el código; el sistema de referidos real usa `referrals/{code}` y escribe
  `referralCodeUsed`/`referredBy` desde el Admin SDK.
- **`.validate` no se evalúa en borrados.** Para impedir que un cliente borre un
  `paymentTxHash` ya registrado hay que bloquearlo desde el `.validate` del padre.

---

## 6. Pruebas sin desplegar (HTTPS temporal)

Si aún no quieres desplegar pero necesitas HTTPS en el teléfono:

```bash
# Con cloudflared (túnel de Cloudflare)
cloudflared tunnel --url http://localhost:3000
# Con ngrok
ngrok http 3000
```

> La URL del túnel cambia en cada ejecución: si la pruebas dentro de la World App, tendrás que añadirla a la allowlist del Developer Portal o usar el dominio canónico de Vercel.

---

## Notas de seguridad / deuda técnica

- `next.config.js` tiene `typescript.ignoreBuildErrors: true` y `eslint.ignoreDuringBuilds: true`. Para un feature de seguridad conviene arreglar los errores TS pre-existentes y activarlos (el build fallará si hay errores).
- El email va incrustado en la URL del link de respaldo (`?email=…`). Es seguro (el `oobCode` debe coincidir con ese email), pero si lo consideras otro punto de filtración, se puede sustituir por el flujo con `isSignInWithEmailLink` + `signInWithEmailLink` comprobando la origin.
- **Verificación de pagos World App pendiente de endurecer.** El pipeline actual de userOperations (ERC-4337) consulta el Developer Portal una sola vez y las reservas se marcan como confirmadas antes de la verificación on-chain. Ver el aviso en `docs/ADVANCED_INTEGRATIONS.md` antes de habilitarlo en producción con fondos reales.
