# World ID (Proof of Humanity)

Inkfinity usa **World ID 4.0** como prueba de humanidad y como segundo factor de
autenticación. Reemplazó por completo al antiguo 2FA facial (MediaPipe + Gemini),
eliminado en el commit `df4df82`; ese sistema queda documentado solo como
referencia histórica en [`docs/archive/FACIAL_VERIFICATION.md`](archive/FACIAL_VERIFICATION.md).

## Qué aporta

- **Unicidad**: cada persona produce un *nullifier* estable por `(app, action)`.
  El backend lo usa para impedir que una misma persona cree o vincule más de una
  cuenta.
- **Privacidad**: el servidor recibe una prueba ZK, nunca datos biométricos,
  documentos ni plantillas.
- **Verificación server-side**: el cliente no decide nada; solo reenvía el
  resultado de IDKit, que el backend valida contra el verificador de World.

## Acciones configuradas

| Acción | Uso | Endpoint que firma el RP context |
| --- | --- | --- |
| `inkfinity-auth` | Login y signup (usuario no autenticado) | `POST /api/auth/worldid/rp-context` (público) |
| `inkfinity-account` | Vincular World ID a una cuenta ya autenticada desde `/settings` | `POST /api/worldid/rp-context` (requiere sesión) |

Ambas acciones deben existir en el Developer Portal para la misma app. Si una
acción no está registrada, IDKit falla antes de generar la prueba.

## Flujo

1. El cliente pide un **RP context** firmado al backend.
2. El backend firma `{ action, nonce, created_at, expires_at }` con
   `RP_SIGNING_KEY` (`signRequest` de `@worldcoin/idkit-core/signing`).
3. El cliente abre IDKit con `app_id`, `action`, `rp_context`, `environment` y el
   preset `orbLegacy()`.
4. La World App devuelve el resultado de IDKit.
5. El cliente lo envía a `POST /api/worldid/verify` con `Authorization: Bearer <idToken>`.
6. El backend reenvía el payload **sin remapear** a
   `https://developer.world.org/api/v4/verify/{rp_id}`.
7. Si la prueba es válida, se normaliza el nullifier y se vincula atómicamente a
   la cuenta.

### Login / signup

- `signup-form.tsx` y `login/page.tsx` usan `action: 'inkfinity-auth'`.
- El alta de cuenta se completa en `POST /api/auth/worldid/signup`, que marca
  `worldIdVerified: true` y registra el nullifier en el índice server-only.

### Vincular desde ajustes

- `src/app/settings/world-id-verification.tsx` usa `action: 'inkfinity-account'`.
- `POST /api/worldid/verify` toma el `uid` **exclusivamente** del token de sesión,
  nunca del body.

## Variables de entorno

| Variable | Ámbito | Descripción |
| --- | --- | --- |
| `NEXT_PUBLIC_WORLD_APP_ID` | cliente | `app_...` del Developer Portal. Lo usan IDKit y `MiniKit.install()`. |
| `WORLD_ID_RP_ID` | servidor | `rp_...` del Developer Portal. Alternativa legacy: `WORLD_RP_ID`. |
| `RP_SIGNING_KEY` | servidor (secreto) | Clave de firma del RP: 64 caracteres hex, opcionalmente con prefijo `0x`. Nunca con `NEXT_PUBLIC_`. |
| `WORLD_ID_ENVIRONMENT` | servidor | `production` (default) o `staging`. `staging` habilita el simulador y **no** debe usarse en producción. |

El servidor es la autoridad del entorno: publica `environment` en el RP context y
rechaza cualquier prueba cuyo `environment` no coincida.

## Modelo de datos (RTDB)

| Ruta | Escritura | Contenido |
| --- | --- | --- |
| `users/{uid}/worldIdVerified` | solo Admin | `true` si la cuenta está vinculada |
| `users/{uid}/worldIdVerifiedAt` | solo Admin | ISO timestamp |
| `worldId_nullifiers/{nullifier}` | solo Admin | `{ uid, verifiedAt }` — índice nullifier → cuenta |
| `worldId_used_proofs/{sha256}` | solo Admin | timestamp; anti-replay |

El nullifier se normaliza a hex minúsculas (`0x` + 64 hex) para que variantes de
mayúsculas no permitan vincular la misma persona dos veces.

## Seguridad

- **Replay protection**: cada payload de IDKit se hashea (SHA-256) y se registra
  en una transacción atómica; un segundo envío se rechaza.
- **Un nullifier = una cuenta**: la vinculación usa una transacción
  *read-check-write*, así dos cuentas no pueden reclamar el mismo nullifier.
- **Fail closed**: si el verificador no responde, devuelve 404/429/5xx o hay
  timeout (20 s), la API responde `503 WORLDID_UNAVAILABLE`; nunca se interpreta
  como rechazo ni como aprobación.
- **Entorno**: una prueba de `staging` (simulador) se rechaza si el servidor está
  en `production`.
- **Acciones como namespace**: un nullifier de `inkfinity-auth` no sirve para
  `inkfinity-account`.

## Configuración en el Developer Portal

1. Crear la app (o completar la migración a World ID 4.0 con **Enable World ID 4.0**).
2. Copiar `app_id`, `rp_id` y `signing_key`.
3. Crear las acciones `inkfinity-auth` e `inkfinity-account`.
4. Registrar el dominio de producción (`inkfinity-ten.vercel.app`) y el dominio de
   desarrollo si aplica.
5. Para Mini Apps: el mismo `app_id` se usa como App ID de la Mini App.

## Troubleshooting

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `WORLDID_UNAVAILABLE` en `/api/.../rp-context` | falta `WORLD_ID_RP_ID`/`WORLD_RP_ID` o `RP_SIGNING_KEY`, o la clave no tiene 64/66 hex | revisar longitud; el servidor elimina comillas accidentales |
| `WORLDID_ENVIRONMENT_MISMATCH` | prueba `staging` contra servidor `production` (o viceversa) | alinear `WORLD_ID_ENVIRONMENT` con el entorno de IDKit |
| `World ID proof did not include a uniqueness nullifier` | se usó un proof de sesión | usar `orbLegacy()` (prueba de unicidad) |
| 404 al verificar | `rp_id` inexistente o app sin RP | completar RP registration en el portal |
| IDKit no abre | acción no creada en el portal o `app_id` inválido | crear la acción y revisar `NEXT_PUBLIC_WORLD_APP_ID` |
