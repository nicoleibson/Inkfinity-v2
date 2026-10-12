# Advanced Platform Integrations

This document describes the architecture and implementation of backend logic and AI flows that extend the platform's core capabilities.

---

## Current Integrations

### Genkit AI Flows (in `src/ai/`)

All server-side AI logic is implemented with [Genkit](https://firebase.google.com/docs/genkit) (`genkit 1.28.0`) and exposed to the app as **server actions** via `flows/`:

| Flow | Agent | Purpose |
| --- | --- | --- |
| `verifyFace` | `verify-face-agent.ts` | Compares the registered facial scan + 3 chronological live captures (sent as data URIs), returns `isMatch` + `confidence` (0-1). Rejection needs `confidence ≥ 0.92` (enforced server-side in `api/auth/face-verified`). See `docs/FACIAL_VERIFICATION.md`. |
| `generateArtworkDetails` | `artwork-details-generation-agent.ts` | Generates title, description, and tags for uploaded artwork. |
| `moderateImage` | `image-moderation-agent.ts` | Scans images for inappropriate content and blocks flagged uploads. |
| `generateOnboardingContent` | `onboarding-assistant-agent.ts` | Creates a professional bio and avatar for new users. |
| `watermarkImage` | `watermark-image-agent.ts` | Applies the "Inkfinity" watermark server-side. |
| `verifyNftOwnership` | `verify-nft-ownership-agent.ts` | Real on-chain ownership read (ERC-721 `ownerOf` / ERC-1155 `balanceOf`) via `src/lib/nft-verification.ts`. Supports every network in `NETWORK_NAMES`; defaults to the platform network, so it never silently verifies against a testnet. |
| `geocodeAddress` | `geocode-address-agent.ts` | Resolves addresses to coordinates via Google Maps. |

Each flow has a **Zod schema** in `src/ai/schemas/` (strict input/output validation) and a thin wrapper in `src/ai/flows/`. Genkit is configured in `src/ai/genkit.ts` (Google GenAI provider; API key resolution: `GEMINI_API_KEY` → `GOOGLE_GENAI_API_KEY` → `GOOGLE_API_KEY` → `NEXT_PUBLIC_*`).

> Prompt/media payloads use Genkit's `{{media url=...}}` syntax; the verify-face agent receives up to 4 images per call.

### Firebase Cloud Functions (`inkfinity-ml/`)

A separate Node.js directory (`inkfinity-ml/`) hosts Firebase Functions (v2) using `firebase-admin` with Application Default Credentials (`admin.initializeApp()`). It currently provides admin-side automation such as reconciling Realtime Database users with Firebase Authentication.

### Client-Side ML (`src/lib/client/`)

Heavy vision models run in the browser (not on the server) so the AI layer only consumes small JPEG data URIs:

- **`face-capture.ts`** — MediaPipe FaceDetector + FaceLandmarker (local WASM + `.tflite`/`.task` in `public/models/`), frame compression, and the liveness sequence (blink + head motion).
- **`camera.ts`** — camera access with actionable diagnostics (HTTPS check, permissions, device-in-use).

> The former `face-recognition.ts` (face-api.js embeddings) was removed; identity is decided server-side by the Gemini comparison. See `docs/FACIAL_VERIFICATION.md`.

### WorldChain + Worldcoin MiniKit (`src/lib/world-app.ts`)

Inkfinity settles payments on **WorldChain** using the **native token WLD** (chain ID **480**).

| Concept | Value |
| --- | --- |
| Production network | `worldchain` (chainId 480, WLD) |
| Test network | `worldchainSepolia` (chainId 4801, WLD) |
| Legacy | `polygon` (MATIC), `amoy` (test) |
| Config source | `platform_settings.network` in Realtime Database (overrides the code default) |
| Single source of truth | `NETWORK_NAMES` / `DEFAULT_NETWORK` in `src/lib/blockchain.ts` |

A single wallet path is supported:

1. **Inside the World App (native).** `isInWorldApp()` (`MiniKit.isInWorldApp()`) switches the wallet layer to MiniKit + **SIWE**. There is no QR and no injected provider — the World App provides an EIP-1193 provider whose `eth_requestAccounts` and `eth_chainId` (480) are routed through MiniKit. Global typing lives in `global.d.ts`.

> **WalletConnect / Reown (AppKit) was removed.** There is no external/QR wallet flow on the regular web; payments happen only inside the World App. See `src/context/wallet-provider.tsx` and `src/lib/world-app.ts`.

**UserOperations (ERC-4337).** `MiniKit.sendTransaction` returns a **userOpHash**, not a conventional `txHash`, so the usual `tx.wait()` pattern does not apply. The server resolves the userOp through the World Developer Portal:

```
GET https://developer.world.org/api/v2/minikit/userop/{userOpHash}
```

This endpoint is public (no API key required). Public RPC endpoints generally **reject** `eth_getUserOperationByHash` (e.g. Alchemy's public WorldChain RPC answers `401: Only core evm requests are allowed.`), which is why resolution goes through the Developer Portal.

`src/app/api/verify-payment/route.ts` accepts either a `txHash` (web / EOA) or a `userOpHash` (World App) and answers:

- `202 Accepted` — still pending confirmation,
- `422 Unprocessable Entity` — the transfer could not be proven,
- `409 Conflict` — the payment reference was already redeemed,
- `200 OK` — credited.

##### How a user operation is actually verified

`src/lib/server/userop-verification.ts` resolves the userOp and then verifies it against
**three independent on-chain facts**, because the settling transaction points at the
ERC-4337 **EntryPoint** with `value = 0` and therefore says nothing about what the user paid:

1. **`UserOperationEvent`** (`src/lib/userop-encoding.ts`) — the event the EntryPoint emits
   inside the settling transaction. Matching `topic1` against the claimed `userOpHash` binds
   the claim to a real, **successful** operation and yields the `sender`. The EntryPoint
   address is read from the emitting log, so EntryPoint 0.6 and 0.7 both work without
   hardcoding an address.
2. **Exact recipient and amount** — when `RPC_WORLDCHAIN_BUNDLER_URL` is configured, the
   userOp is fetched with `eth_getUserOperationByHash` and its fields are validated against
   the claimed hash by **recomputing the ERC-4337 `userOpHash` locally**. A bundler that
   lies about `to`/`value` is detected.
3. **Treasury balance delta** — with no bundler configured, the recipient's balance is
   compared across the settling block and must have grown by at least the required fee.

Every path fails closed: if the payment cannot be proven, nothing is credited.

> Public World Chain RPCs reject `eth_getUserOperationByHash`
> (`401: Only core evm requests are allowed.`) and no public World Chain bundler serves it,
> so **path 3 is the default**. It is conservative but sound: the funds must have actually
> arrived. Set `RPC_WORLDCHAIN_BUNDLER_URL` to get exact `to`/`value` proof.

##### Other hardening in the same pipeline

- **Authentication.** Both verification endpoints use the Admin SDK, which bypasses
  `database.rules.json`, so they require an `Authorization: Bearer <Firebase ID token>`
  header (`src/lib/server/auth.ts`) and take the acting user **from the verified token**,
  never from the request body. Previously `/api/verify-payment` accepted any `userId`,
  which let a third party redeem someone else's payment.
- **Replay protection.** Every redeemed payment writes a `payment_claims/<network>:<hash>`
  record. Reusing a reference is rejected with `409`; an identical retry from the same user
  is idempotent. Without this, replaying one `txHash` granted an extra year of membership
  and another referral commission on every call.
- **Confirmation depth.** Regular transfers require 5 confirmations before being credited.
- **Zero-fee path.** A fully discounted fee has no transaction to verify, so the client
  sends `freePassage: true` and the **server** independently confirms the fee is really zero.
  The trial is only (re)started when missing or expired, so it cannot be stacked.
- **Booking deposits and refunds** go through `src/app/api/verify-booking-payment/route.ts`,
  which proves the transfer (recipient, amount, payer, depth) and only then flips the
  booking status. The client no longer writes the status itself.
- **Database rules** restrict `paymentTxHash`, `cancellationTxHash`, `depositConfirmedAt`,
  `refundConfirmedAt` to admins, forbid lowering `depositAmount`, and block a
  non-admin from setting `status: 'confirmed'` on a booking that has a deposit. Server
  writes (Admin SDK) bypass these rules, which is what makes the server the only path that
  can settle a payment.
- **Shared pricing** (`src/lib/pricing.ts`) is used by both the client (to quote a deposit)
  and the server (to bound a valid transfer) so the amounts agree. It replaces the Genkit
  `get-crypto-price` flow, which returned a hardcoded `3500` USD and priced WLD payments
  with the ETH price. The server fails closed with `PRICE_UNAVAILABLE` if no price can be
  obtained, because an amount bound that cannot be computed is not a bound.

> ⚠️ **Operational notes**
> - `PRICE_API_BASE_URL` (default: CoinGecko simple price) and `RPC_WORLDCHAIN_BUNDLER_URL`
>   must be set in Vercel for booking settlements on WorldChain.
> - `ALLOW_MOCK_PRICES=true` enables the legacy hardcoded price for local development only.
> - Membership fees are stored in crypto units in `platform_settings`, so they need no price
>   lookup; only USD-denominated booking deposits do.

The web/EVM path additionally fixes a real-world signer bug: browsers may expose several accounts while `ethers` holds a different one, so every `getSigner()` call passes the address explicitly (`getSigner(walletAddress ?? undefined)`) to avoid `no such account`.

---

## Future Integrations

As the platform evolves, this section will include blueprints for:

*   **Scheduled Tasks:** Automated jobs that run periodically, such as cleaning up data, checking for expired trials, or sending summary emails.
*   **Complex Backend Logic:** Operations that require elevated privileges or are too intensive to run on the client-side, like processing payments with a third-party gateway or performing complex data aggregation.
*   **Third-Party API Integrations:** Securely interacting with external services that require private API keys. (The `GEMINI_API_KEY` secret is already wired through the Vercel environment variables.)

Currently, the primary server-side logic runs directly inside the Next.js application, deployed to **Vercel** (`https://inkfinity-ten.vercel.app`), with Firebase providing Authentication and Realtime Database.

### Database Maintenance & Admin Cleanup
To maintain database performance (Realtime Database), the platform includes robust administrative tools designed to purge obsolete data (such as orphaned likes, outdated bookings, stale aliases, and orphaned records). Image storage is handled externally via Google Drive (user accounts) and IPFS (NFTs), so no local file cleanup is required.
- **Web Interface:** Accessible via `/admin/cleanup` for users with Super-Administrator permissions. It scans the database and applies a patch update safely.
- **Terminal Execution:** A CLI script is provided in the project root (`cleanup-script.mjs` and `run-cleanup.sh`). It runs offline via the Firebase Client SDK authenticated via credentials passed in the terminal.
Usage: `./run-cleanup.sh "admin_email" "admin_password"`
