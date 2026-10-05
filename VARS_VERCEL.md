# Variables de entorno en Vercel

## SERVER-SIDE (secretas) — marcar como "Secret" / Environment Variables sin NEXT_PUBLIC_
Estas nunca llegan al navegador. Poner en Production, Preview y Development (según necesidad).

| Variable | Tipo | Dónde obtenerla | Notas |
|---|---|---|---|
| `FACE_VERIFICATION_SECRET` | SECRETA | Generada: `openssl rand -base64 48` (ya está en `.env.local`) | Firma HMAC de cookies `face_req_signed` / `face_verified_signed`. Rotarla invalida grants activos. Requerida en producción. |
| `FIREBASE_CLIENT_EMAIL` | SECRETA | Firebase Console → Project Settings → Service Accounts → Generate Private Key (.json) | Service Account para Firebase Admin SDK. |
| `FIREBASE_PRIVATE_KEY` | SECRETA | Mismo JSON | Incluir `\n` literales (tal cual viene). |
| `GEMINI_API_KEY` | SECRETA | Google AI Studio / Google Cloud | Usado por Genkit (verificación facial). También puede usarse `GOOGLE_GENAI_API_KEY`. |
| `RP_SIGNING_KEY` | SECRETA | World Developer Portal | Signing key para World ID proofs. **Nunca** exponer al cliente. |
| `RPC_WORLDCHAIN_URL` | SECRETA (recomendada) | Alchemy/Infura/etc. | URL con API key. Si expuesta, rota la key. |
| `RPC_WORLDCHAIN_BUNDLER_URL` | SECRETA (recomendada) | Alchemy Bundler (UserOps) | Suele incluir API key. |
| `RPC_WORLDCHAIN_SEPOLIA_URL` | Opcional (secreta si tiene key) | Alchemy | Solo testnet. |
| `RPC_WORLDCHAIN_SEPOLIA_BUNDLER_URL` | Opcional | Alchemy | Solo testnet. |
| `RPC_AMOY_URL` | Pública/fallback | Polygon RPC o propio | Puede tener key o no. Si tiene key, secreta. |
| `RPC_POLYGON_URL` | Pública/fallback | Polygon RPC | Igual regla. |
| `PRICE_API_BASE_URL` | Pública | Coingecko (o tu proxy) | Normalmente pública. |
| `WORLD_ID_ENVIRONMENT` | Config | `production`/`staging` | No sensible. Puede ser pública o env var normal. |

## CLIENT-SIDE (públicas) — DEBEN llevar `NEXT_PUBLIC_`
Expuestas en el bundle del navegador. **Nunca** pongas secretos aquí.

| Variable | Notas |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Clave web de Firebase (no es un secreto de Admin). |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Opcional (Analytics). |
| `NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS` | Dirección del monedero de plataforma. |
| `NEXT_PUBLIC_WORLD_APP_ID` | World App ID (público). |
