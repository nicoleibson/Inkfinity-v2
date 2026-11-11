# Variables de entorno en Vercel

Configuración vigente (post-migración a **World ID**; el 2FA facial fue eliminado).
Ver también `.env.example` y `docs/WORLD_ID.md`.

> **Importante:** `NEXT_PUBLIC_*` se inyecta en build time. Tras cambiar cualquier
> variable hay que **redeploy (rebuild)**, no basta un restart.

## SERVER-SIDE (secretas)

| Variable | Ámbito | Dónde obtenerla | Notas |
|---|---|---|---|
| `FIREBASE_CLIENT_EMAIL` | server | Firebase Console → Project Settings → Service Accounts → Generate Private Key (.json) | Service Account del Admin SDK. |
| `FIREBASE_PRIVATE_KEY` | server | Mismo JSON | Incluir los `\n` literales tal cual vienen. |
| `GEMINI_API_KEY` | server | Google AI Studio / Google Cloud | Genkit (todos los flows de IA). Alternativas: `GOOGLE_GENAI_API_KEY`, `GOOGLE_API_KEY`. |
| `RP_SIGNING_KEY` | server | World Developer Portal → App → RP | **Secreta.** Clave de firma del RP: 64 hex (66 con `0x`). Nunca con `NEXT_PUBLIC_`. Si se filtra, rotarla en el portal. |
| `WORLD_ID_RP_ID` | server | World Developer Portal | `rp_...`. Alternativa legacy: `WORLD_RP_ID`. |
| `WORLD_ID_ENVIRONMENT` | server | Config | `production` (default) o `staging` (simulador, solo pruebas). |
| `WORLD_ID_PROOF_RETENTION_DAYS` | server | Config | Días que se conservan los hashes anti-replay de `worldId_used_proofs`. Default: `90`. |
| `CRON_SECRET` | server | Config | Secreto que Vercel envía como `Authorization: Bearer` al cron diario de purga. Sin él, el cron recibe 401. |
| `PLATFORM_WALLET_PRIVATE_KEY` | server | Wallet de tesorería | **Secreta.** Firma los payouts de referidos on-chain (WLD en World Chain). Sin ella el endpoint `/api/referral-payouts/on-chain` responde 503. |
| `PLATFORM_WALLET_ADDRESS` | server | Wallet de tesorería | Fallback server-side de la dirección pública. |
| `RPC_WORLDCHAIN_URL` | server | Alchemy/Infura | **Nombre canónico.** RPC mainnet con API key, usado por verificación de pagos userOp, NFT y payouts on-chain (`src/lib/worldchain-rpc.ts`). |
| `RPC_WORLDCHAIN_SEPOLIA_URL` | server | Alchemy/Infura | Solo testnet (opcional). |
| `RPC_WORLDCHAIN_BUNDLER_URL` | server | Alchemy Bundler | Verifica `to`/`value` exactos de userOps (opcional, recomendado). |
| `RPC_WORLDCHAIN_SEPOLIA_BUNDLER_URL` | server | Alchemy Bundler | Solo testnet (opcional). |
| `RPC_POLYGON_URL` | server | Polygon RPC | Fallback/legacy. |
| `RPC_AMOY_URL` | server | Polygon Amoy RPC | Fallback/legacy. |
| `WORLDCHAIN_RPC_URL` | server | Alchemy/Infura | Alias legacy de `RPC_WORLDCHAIN_URL`; se sigue respetando. No hace falta si ya está la canónica. |
| `PRICE_API_BASE_URL` | server | CoinGecko o proxy | Endpoint compatible con `simple/price`. |
| `ALLOW_MOCK_PRICES` | server | Config | `true` **solo en local**. Nunca en producción. |

## CLIENT-SIDE (públicas, `NEXT_PUBLIC_`)

| Variable | Notas |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Clave web de Firebase (no es secreto de Admin). |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `inkfinity-2d470.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | `https://inkfinity-2d470-default-rtdb.firebaseio.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `inkfinity-2d470` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Bucket de Storage. |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Opcional (Analytics). |
| `NEXT_PUBLIC_WORLD_APP_ID` | `app_...` del Developer Portal. Lo usan IDKit y `MiniKit.install()`. |
| `NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS` | Dirección pública de la wallet de tesorería en World Chain. |
| `NEXT_PUBLIC_WORLDCHAIN_RPC_URL` | Alias público, último fallback antes del RPC público de Alchemy. Solo si el cliente necesita leer la cadena. |
| `NEXT_PUBLIC_SITE_URL` | URL canónica del sitio (metadata/links). |

## Developer Portal de World ID

1. App con **World ID 4.0** habilitado (botón *Enable World ID 4.0* si migraste una app vieja).
2. Copiar a Vercel: `app_id` → `NEXT_PUBLIC_WORLD_APP_ID`; `rp_id` → `WORLD_ID_RP_ID`; `signing_key` → `RP_SIGNING_KEY`.
3. Crear las acciones **`inkfinity-auth`** (login/signup) e **`inkfinity-account`** (vincular desde ajustes).
4. Registrar el dominio de producción (`inkfinity-ten.vercel.app`) en la app/Mini App.
5. Para pagos dentro de World App se usa el mismo `app_id` de Mini App.

## Variables retiradas

| Variable | Motivo |
|---|---|
| `FACE_VERIFICATION_SECRET` | El 2FA facial fue eliminado (commit `df4df82`); reemplazado por World ID. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect/Reown fue eliminado; solo MiniKit. |
