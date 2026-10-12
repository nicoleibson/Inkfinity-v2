# Verificación Facial (2FA) — Referencia y Guía de Reproducción

Documento autónomo que describe el sistema completo de **verificación facial como segundo factor de autenticación (2FA)** de Inkfinity, con el nivel de detalle necesario para **reproducirlo externamente en otro proyecto** (mismo stack: Next.js App Router + Firebase + Genkit/Gemini + MediaPipe).

A diferencia de `docs/SECURITY.md` (que explica *por qué* cada control existe), este documento es un **plano de implementación**: contratos, umbrales, esquema de datos, variables de entorno y checklist de puesta en marcha.

---

## 1. Resumen

El sistema verifica, en el servidor, que la persona frente a la cámara es la misma cuyo rostro está registrado en su perfil. Se activa **opcionalmente** y solo se exige/permite a usuarios con **membresía de pago activa**.

Propiedades clave:

- **Nada se decide en el cliente.** El navegador captura frames y ejecuta liveness, pero el **grant** solo lo emite el servidor tras volver a comparar contra el scan registrado en la base de datos.
- **Granularidad biométrica.** El umbral de aceptación es `isMatch && confidence >= 0.92`.
- **Anti-spoofing.** Se exige liveness (parpadeo o movimiento 3D de cabeza) sobre ~2.2 s de video; una foto impresa no puede superarlo.
- **Rate limiting doble.** Lock en el cliente (UX) y lock real en el servidor (`facialAttempts` en RTDB), con escalado 3→30 s, 5→5 min, 7→30 min.
- **Grant a prueba de manipulación.** Cookie `httpOnly`, firmada con HMAC-SHA256 (`face_verified_signed`), atada al `uid`. El middleware la valida y también el custom claim de Firebase Auth.
- **Fallback sin cámara.** Email-link de Firebase Auth (`sendSignInLinkToEmail` + `signInWithEmailLink`).

---

## 2. Arquitectura por capas

La verificación es una cadena; cada capa está detrás de la anterior y el fallo de una capa de modelo puede *abrir* (fail-open) solo cuando el modelo no está disponible, nunca cuando hay un veredicto negativo.

```
[Cliente]                          [Servidor]                       [Infra]
─────────────────────────────     ──────────────────────────       ──────────────────
1. getUserMedia (camera.ts)
2. FaceDetector: 1 rostro             
   (face-capture.ts)               
3. Liveness: blink/head-motion     
   (FaceLandmarker, ~2.2s)         
4. 3 frames JPEG (480px, q=0.72)   
5. GET  lock (face-lock.ts)  ───────────────►  users/{uid}/facialAttempts (RTDB)
6. POST /api/auth/face-verified ─────────────►  verify -> grant
   { frame1, frame2, frame3 }        │  a. verifySessionCookie (Admin)
                                     │  b. lock check (429)
                                     │  c. profile lookup (2FA + scan + membership)
                                     │  d. isSafeScanUrl (anti-SSRF)
                                     │  e. verifyFace (Gemini, 3 frames + registro)
                                     │     -> isMatch + confidence
                                     │  f. umbral 0.92
                                     │  g. setCustomUserClaims
                                     │  h. cookie face_verified_signed (HMAC)
                                     ◄─────────────────────────────
7. getIdToken(true) -> /api/auth/session (refresca __session con el claim)
8. router.push(redirect)
                       middleware.ts valida face_req_signed + face_verified_signed
```

---

## 3. Requisitos previos

### 3.1 Dependencias npm

```bash
npm install @mediapipe/tasks-vision
npm install firebase firebase-admin
npm install genkit @genkit-ai/google-genai
# opcional (UI): lucide-react, y tu librería de componentes
```

> **No se usa `face-api.js`.** Los embeddings deterministas (descriptores 128-D) fueron **desactivados**: la verificación de identidad la hace directamente el modelo generativo sobre los frames. Los ficheros `public/models/face-api/*` son legado y no se importan.

### 3.2 Assets de modelo (auto-hospedados)

Colocar en `public/models/`:

```
public/models/
├── mediapipe/                      # runtime WASM de MediaPipe Tasks Vision
│   ├── vision_wasm_internal.js
│   ├── vision_wasm_internal.wasm
│   ├── vision_wasm_module_internal.wasm
│   ├── vision_wasm_nosimd_internal.js
│   └── vision_wasm_nosimd_internal.wasm
├── face-detector.tflite            # modelo FaceDetector (MediaPipe)
└── face_landmarker.task            # modelo FaceLandmarker (liveness + blendshapes)
```

Se sirven localmente (`WASM_BASE = "/models/mediapipe"`), no desde CDN, para no depender de terceros y para que la CSP permita `'self'`.

### 3.3 Variables de entorno

| Variable | Scope | Uso en el sistema |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | público | cliente Firebase |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | público | `*.firebaseapp.com`; auth popup/iframe |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | público | RTDB (`*.firebaseio.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | público | Admin SDK |
| `FIREBASE_CLIENT_EMAIL` | servidor | Admin SDK (service account) |
| `FIREBASE_PRIVATE_KEY` | servidor | Admin SDK (con `\n` literales) |
| `FACE_VERIFICATION_SECRET` | servidor | **clave HMAC** de `face_req_signed`/`face_verified_signed`. Obligatoria en producción (si falta, el servidor lanza error). `openssl rand -base64 48` |
| `GEMINI_API_KEY` (o `GOOGLE_GENAI_API_KEY` / `GOOGLE_API_KEY`) | servidor | Genkit/Gemini para `verifyFace` |

> `FACE_VERIFICATION_SECRET` es la pieza que hace que un grant no se pueda forjar desde el navegador. Rotarla invalida todos los grants activos (los usuarios 2FA deberán reverificar).

---

## 4. Flujo end-to-end

### 4.1 Registro del rostro (una sola vez, `/settings`)

`src/app/settings/page.tsx`:

1. El usuario activa el switch 2FA (`handle2FAToggle`). Requiere `hasActiveMembership(profile)`.
2. `captureFaceFrame(video, canvas)` dibuja el frame y cuenta rostros con `FaceDetector`.
   - `faceCount === 0` → **rechazo** ("No Face Detected").
   - `faceCount > 1` → **rechazo** ("Multiple Faces Detected").
   - `faceCount === -1` (modelo no disponible) → *fail-open*.
3. `captureLiveSequence(video, canvas)` ejecuta el liveness. Si `!isLive`, se aborta.
4. Se guarda `facialScanUrl = <frame JPEG>` y `twoFactorEnabled = true` en `users/{uid}`.

### 4.2 Login y redirección a `/verify-face`

- Tras login con password, `login/page.tsx` comprueba `profile.twoFactorEnabled && profile.facialScanUrl` y redirige a `/verify-face?redirect=<origen>`.
- `src/app/verify-face/page.tsx` setea la cookie `__session` en el mount (POST `/api/auth/session` con el `idToken`) para que el endpoint de grant pueda autenticar.

### 4.3 Verificación (`/verify-face`)

`src/components/auth/face-verifier.tsx` → `captureAndProcessFace()`:

1. Lee el lock del cliente (`getVerificationLock`). Si está bloqueado, avisa y sale.
2. `captureFaceFrame` → control de 0 / >1 rostros.
3. Comprueba `profile.facialScanUrl` (si no hay, no se puede verificar).
4. Liveness con **timeout de seguridad de 8 s** (`Promise.race` contra `captureLiveSequence`). Si `liveness !== "unavailable"` y `!isLive` → fallo (cuenta intento). Si el modelo no está: se omite el liveness (*fail-open*).
5. Construye 3 frames cronológicos: `frames[0..2]` del liveness; si faltan, replica el frame principal.
6. `POST /api/auth/face-verified` con `{ frame1, frame2, frame3 }`.
7. Según la respuesta: éxito → `resetVerificationFailures` + `onVerificationSuccess()`; fallo → `registerVerificationFailure(uid)`.
8. En éxito, `verify-face/page.tsx` hace `getIdToken(true)` y refresca `__session` (para propagar el custom claim), y luego `router.push(redirect)`.

### 4.4 Grant en servidor (`POST /api/auth/face-verified`)

Ver §6 para el contrato completo. Resumen:

1. Requiere cookie `__session` (si no → `401`).
2. Valida que lleguen **3 data-URIs** `data:image/(png|jpeg|webp);base64,…` (si no → `400`).
3. `verifySessionCookie(cookie, true)` → `uid` (si falla → `401`).
4. **Lock del servidor** (`users/{uid}/facialAttempts`): si `lockedUntil > now` → `429`.
5. Lee el perfil: debe existir (`404`), tener `twoFactorEnabled === true` y `facialScanUrl` (si no → `403`), y `hasActiveMembership` (si no → `403`).
6. `isSafeScanUrl(profile.facialScanUrl)` (anti-SSRF; si no → `403`).
7. `verifyFace({ registeredImageUrl, liveCaptureDataUri: frame1, liveCaptureFrame2: frame2, liveCaptureFrame3: frame3 })`.
   - Error del modelo/infra → `502` **sin** contar fallo del usuario.
8. `accepted = isMatch === true && confidence >= 0.92`.
   - No aceptado → `registerServerFailure` → `401` con `{ success:false, isMatch:false, confidence, reason }`.
9. Aceptado → `resetServerFailures`; `setCustomUserClaims(uid, { faceVerified: true, faceVerifiedAt })`; set cookie `face_verified_signed` (HMAC, httpOnly, 1 h) → `200`.

---

## 5. Componentes del sistema

| Componente | Archivo | Responsabilidad |
| --- | --- | --- |
| Acceso a cámara | `src/lib/client/camera.ts` | `getUserMedia` con reintento por constraints y diagnóstico accionable (`unsupported`/`no-device`/`denied`/`in-use`) |
| Detección + liveness | `src/lib/client/face-capture.ts` | `FaceDetector` (conteo), `FaceLandmarker` (blink/head-pose), compresión JPEG |
| Lock cliente | `src/lib/face-lock.ts` | `getVerificationLock`, `registerVerificationFailure`, `resetVerificationFailures` sobre RTDB |
| UI verificación | `src/components/auth/face-verifier.tsx` | Orquesta captura, liveness, llamada al grant y toasts |
| Página 2FA | `src/app/verify-face/page.tsx` | Auth guard, set `__session`, refresh de claim, redirect |
| Grant servidor | `src/app/api/auth/face-verified/route.ts` | Verificación real + lock servidor + SSRF + claims + cookie HMAC |
| Flujo IA | `src/ai/flows/verify-face-flow.ts` + `src/ai/agents/verify-face-agent.ts` | Prompt y flow Genkit |
| Esquema IA | `src/ai/schemas/verify-face-schema.ts` | `VerifyFaceInput` / `VerifyFaceOutput` (zod) |
| Init IA | `src/ai/genkit.ts` | Resolución de API key y plugin `googleAI` |
| Firma HMAC | `src/lib/crypto/hmac.ts` | `signFaceRequirement`/`verifyFaceRequirement`, `signFaceVerified`/`verifyFaceVerified` (Web Crypto, Edge) |
| Middleware | `src/middleware.ts` | Gate de rutas: `face_req_signed` + `face_verified_signed` + `verify-session` |
| Sesión | `src/app/api/auth/session/route.ts` | Crea `__session` y `face_req_signed`; refresca |
| Verificación de sesión | `src/app/api/auth/verify-session/route.ts` | Devuelve `profile` + `faceVerifiedAt`; distingue 401 (rechazo) vs 503 (outage) |
| Logout | `src/app/api/auth/logout/route.ts` | Borra `__session` y cookies firmadas |
| Fallback email | `src/lib/email-fallback.ts` + `src/app/verify-face/email-link/page.tsx` | Link de un solo uso, funciona desde otro dispositivo |

---

## 6. Contratos de API

### `POST /api/auth/face-verified`

- **Cookie requerida:** `__session=<firebase session cookie>`
- **Body:**
  ```json
  { "frame1": "data:image/jpeg;base64,…", "frame2": "data:image/jpeg;base64,…", "frame3": "data:image/jpeg;base64,…" }
  ```
- **runtime:** `nodejs`, `dynamic: force-dynamic`

| Status | Cuándo | Body |
| --- | --- | --- |
| `200` | Match aceptado | `{ success: true, confidence, reason }` + `Set-Cookie: face_verified_signed` |
| `400` | JSON inválido / no son 3 data-URIs | `{ error }` |
| `401` | Sin `__session`, cookie inválida o match rechazado | `{ error }` o `{ success:false, isMatch:false, confidence, reason }` |
| `403` | 2FA no habilitado, sin membership, o scan inseguro | `{ error }` |
| `404` | Perfil no encontrado | `{ error }` |
| `429` | Bloqueado por intentos | `{ error: "Too many failed attempts. Try again in N min." }` |
| `502` | Error de modelo/infra (no cuenta fallo) | `{ error }` |

### `GET /api/auth/verify-session`

- Auth por header `Authorization: Bearer <sessionCookie>` (fallback a `?session=`).
- `400` sin sesión · `401` token rechazado · `503` verificación no disponible · `200` `{ uid, profile, faceVerified, faceVerifiedAt }` · `503 { degraded: true }` si falla el lookup de perfil.

### `POST /api/auth/session`

- Body `{ idToken }`. Crea `__session` (14 d) y, si `twoFactorEnabled && facialScanUrl && hasActiveMembership`, `face_req_signed` (14 d). En caso contrario borra `face_req_signed`.

---

## 7. Modelo de datos (RTDB)

`users/{uid}` — campos relevantes:

```jsonc
{
  "twoFactorEnabled": true,
  "facialScanUrl": "data:image/jpeg;base64,…",   // o URL HTTPS en allowlist
  "facialAttempts": { "failed": 0, "lockedUntil": null },
  "facialDescriptor": null                        // legado, no usado
}
```

- `facialScanUrl` puede ser un **data-URI** o una **URL HTTPS** de un host permitido. El servidor valida con `isSafeScanUrl` antes de enviarlo al modelo (evita SSRF).
- `facialAttempts` lo escriben **cliente y servidor** de forma transaccional. El servidor es el control real; el cliente solo mejora la UX.
- Referencia de reglas: `users/<uid>` permite `.write` al dueño, pero los campos sensibles (`status`, `paymentDate`, etc.) están protegidos por `.validate` admin-only. Añadir un nodo nuevo obliga a tocar `database.rules.json`.

Hosts permitidos para `facialScanUrl`:

```
lh3.googleusercontent.com
drive.google.com
firebasestorage.googleapis.com
storage.googleapis.com
placehold.co
```

(Las URLs `http:` se rechazan en producción; solo data-URIs y HTTPS.)

---

## 8. Parámetros de seguridad (valores exactos)

| Parámetro | Valor | Archivo |
| --- | --- | --- |
| Umbral de confianza | `0.92` | `api/auth/face-verified/route.ts` |
| Lock pasos | 3→30 s, 5→5 min, 7→30 min | `face-lock.ts`, `face-verified/route.ts` |
| Lock máximo | 30 min | idem |
| TTL grant | 1 h (cookie + `getMaxAge`) | `hmac.ts`, `face-verified/route.ts` |
| TTL `face_req_signed` | 14 d (vida de la sesión) | `api/auth/session/route.ts` |
| TTL custom claim | 1 h (validado en middleware) | `middleware.ts` |
| Liveness duración | 2200 ms @ 110 ms/frame | `face-capture.ts` |
| Liveness dim de análisis | 256 px | `face-capture.ts` |
| Ratio mínimo con rostro | 0.6 | `face-capture.ts` |
| Umbral de parpadeo | 0.6 (`eyeBlinkLeft/Right`) | `face-capture.ts` |
| Umbral de movimiento de cabeza | 4° (pitch/yaw/roll) | `face-capture.ts` |
| minDetectionConfidence | 0.5 | `face-capture.ts` |
| Compresión frame | max 480 px, JPEG q=0.72 | `face-capture.ts` |
| Timeout liveness (UI) | 8000 ms | `face-verifier.tsx` |
| Modelo Gemini | `googleai/gemini-3.5-flash-lite` | `verify-face-agent.ts` |

---

## 9. CSP y requisitos de plataforma

La cámara require **contexto seguro (HTTPS o localhost)**. La CSP debe permitir Firebase Auth y RTDB:

- **`script-src`** debe incluir `'self' 'unsafe-inline' 'unsafe-eval' blob:` y `https://apis.google.com https://www.gstatic.com https://accounts.google.com https://*.firebaseapp.com https://*.firebaseio.com`.
  - `https://*.firebaseio.com` es **imprescindible**: RTDB usa *JSONP long-polling* (`<script src="https://<proj>-default-rtdb.firebaseio.com/.lp?...">`). Sin él, no cargan los datos de usuario.
- **`connect-src`** debe incluir `https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://*.firebase.com`.
- **`frame-src`** debe incluir `https://*.firebaseapp.com https://accounts.google.com https://apis.google.com https://www.google.com https://*.firebaseio.com`.
- **`Permissions-Policy`**: `camera=(self), microphone=(self)`.
- **`img-src`** debe permitir `data:` (los frames son data-URIs) y `blob:`.

---

## 10. Guía de reproducción en otro proyecto (checklist)

1. **Dependencias**: `@mediapipe/tasks-vision`, `firebase`, `firebase-admin`, `genkit`, `@genkit-ai/google-genai`.
2. **Assets**: copiar `public/models/{mediapipe,face-detector.tflite,face_landmarker.task}`.
3. **Firebase**: RTDB + Auth (email/password y, si quieres, Google), Admin SDK con `FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY`.
4. **`FACE_VERIFICATION_SECRET`** en todos los entornos; generarla con `openssl rand -base64 48`.
5. **Genkit**: `src/ai/genkit.ts` con `googleAI({ apiKey: process.env.GEMINI_API_KEY || … })`.
6. **Portar** (ajusta imports/rutas):
   - `src/lib/crypto/hmac.ts` (Web Crypto, sin `node:crypto`, para Edge).
   - `src/lib/client/camera.ts`, `src/lib/client/face-capture.ts`, `src/lib/face-lock.ts`.
   - `src/ai/schemas/verify-face-schema.ts`, `src/ai/agents/verify-face-agent.ts`, `src/ai/flows/verify-face-flow.ts`.
   - `src/app/api/auth/face-verified/route.ts`.
   - `src/components/auth/face-verifier.tsx`, `src/app/verify-face/page.tsx` (+ email-link opcional).
   - `src/middleware.ts` y `src/app/api/auth/{session,verify-session,logout}/route.ts`.
7. **Modelo de perfil**: añadir `twoFactorEnabled`, `facialScanUrl`, `facialAttempts` a tu esquema de usuario.
8. **UI de registro**: reutilizar `face-verifier.tsx` (o `settings/page.tsx`) para capturar y guardar `facialScanUrl`.
9. **Reglas RTDB**: impedir que el usuario forje el lock/estado sensible; el grant lo escribe el servidor (Admin SDK ignora reglas).
10. **CSP/`next.config.js`**: aplicar §9 y `Permissions-Policy`.
11. **Dominios autorizados** (Firebase Auth) si usas el fallback por email.

### Cómo probarlo

- `npm run dev` en `localhost` (contexto seguro exento) y completar registro + verificación.
- En el **servidor de producción real**, confirmar: `200 { success: true, confidence >= 0.92 }` con parpadeo real; `401` con una foto estática; `429` tras 3 fallos; `403` sin membership.
- Probar el email-link abriéndolo **desde otro navegador/dispositivo**.

---

## 11. Limitaciones conocidas y notas de dureza

- **Fail-open del liveness**: si `FaceLandmarker` no carga, el liveness se omite (`"unavailable"`). El control real pasa a ser la comparación del modelo; por eso el umbral es alto (0.92).
- **`faceCount === -1`** (detector no disponible) no bloquea; solo informa.
- **Lock del cliente es evitable**: el control vinculante es el del servidor. No confiar en `face-lock.ts` para seguridad.
- **La cookie `face_verified_signed` dura 1 h**, igual que el claim; pasado ese tiempo el middleware redirige a `/verify-face?expired=true`.
- **El email va incrustado en la URL del link** (`?email=…`). Es seguro porque el `oobCode` debe coincidir con ese email; si se quiere evitar, usar `isSignInWithEmailLink` + `signInWithEmailLink` validando la origin.
- **MediaPipe/GPU**: si el delegate `GPU` falla se cae a `CPU`; dispositivos de gama baja pueden reducir la tasa de muestreo (por eso el análisis a 256 px).
- **CSP**: la causa número uno de "no conecta a Firebase" en producción es olvidar `https://*.firebaseio.com` en `script-src`.

---

*Documento de referencia del sistema de verificación facial 2FA. Ver también `docs/SECURITY.md` (§2.1) y `docs/TROUBLESHOOTING.md`.*
