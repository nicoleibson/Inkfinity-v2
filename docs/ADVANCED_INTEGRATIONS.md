# Advanced Platform Integrations

This document describes the architecture and implementation of backend logic and AI flows that extend the platform's core capabilities.

---

## Current Integrations

### Genkit AI Flows (in `src/ai/`)

All server-side AI logic is implemented with [Genkit](https://firebase.google.com/docs/genkit) (`genkit 1.28.0`) and exposed to the app as **server actions** via `flows/`:

| Flow | Agent | Purpose |
| --- | --- | --- |
| `verifyFace` | `verify-face-agent.ts` | Compares the registered facial scan + 3 chronological live captures (sent as data URIs), returns `isMatch` + `confidence` (0-1). Rejection needs `confidence ≥ 0.8`. |
| `generateArtworkDetails` | `artwork-details-generation-agent.ts` | Generates title, description, and tags for uploaded artwork. |
| `moderateImage` | `image-moderation-agent.ts` | Scans images for inappropriate content and blocks flagged uploads. |
| `generateOnboardingContent` | `onboarding-assistant-agent.ts` | Creates a professional bio and avatar for new users. |
| `watermarkImage` | `watermark-image-agent.ts` | Applies the "Inkfinity" watermark server-side. |
| `verifyNftOwnership` | `verify-nft-ownership-agent.ts` | Checks on-chain NFT ownership (simulated). |
| `geocodeAddress` | `geocode-address-agent.ts` | Resolves addresses to coordinates via Google Maps. |

Each flow has a **Zod schema** in `src/ai/schemas/` (strict input/output validation) and a thin wrapper in `src/ai/flows/`. Genkit is configured in `src/ai/genkit.ts` (Google GenAI provider; API key resolution: `GEMINI_API_KEY` → `GOOGLE_GENAI_API_KEY` → `GOOGLE_API_KEY` → `NEXT_PUBLIC_*`).

> Prompt/media payloads use Genkit's `{{media url=...}}` syntax; the verify-face agent receives up to 4 images per call.

### Firebase Cloud Functions (`inkfinity-ml/`)

A separate Node.js directory (`inkfinity-ml/`) hosts Firebase Functions (v2) using `firebase-admin` with Application Default Credentials (`admin.initializeApp()`). It currently provides admin-side automation such as reconciling Realtime Database users with Firebase Authentication.

### Client-Side ML (`src/lib/client/`)

Heavy vision models run in the browser (not on the server) so the AI layer only consumes small JPEG data URIs:

- **`face-capture.ts`** — MediaPipe FaceDetector + FaceLandmarker (local WASM + `.tflite`/`.task` in `public/models/`), frame compression, and the liveness sequence.
- **`face-recognition.ts`** — face-api.js embeddings (lazy-loaded via dynamic import to avoid SSR issues with tensorflow.js).
- **`camera.ts`** — camera access with actionable diagnostics (HTTPS check, permissions, device-in-use).

### WorldChain + Worldcoin MiniKit (`src/lib/world-app.ts`)

Inkfinity settles payments on **WorldChain** using the **native token WLD** (chain ID **480**).

| Concept | Value |
| --- | --- |
| Production network | `worldchain` (chainId 480, WLD) |
| Test network | `worldchainSepolia` (chainId 4801, WLD) |
| Legacy | `polygon` (MATIC), `amoy` (test) |
| Config source | `platform_settings.network` in Realtime Database (overrides the code default) |
| Default in code | `worldchain` (`src/hooks/usePlatformSettings.ts`) |

Two wallet paths coexist behind a single UI:

1. **Inside the World App (native).** `isInWorldApp()` (`MiniKit.isInWorldApp()`) switches the wallet layer to MiniKit + **SIWE**. There is no QR and no injected provider — the World App provides an EIP-1193 provider whose `eth_requestAccounts` and `eth_chainId` (480) are routed through MiniKit. AppKit is not mounted in this mode. Global typing lives in `global.d.ts`.
2. **Regular web (external).** [Reown AppKit](https://docs.reown.com/appkit) with WalletConnect QR / deep links, falling back to injected extensions (`window.ethereum`) when no Project ID is set.

**UserOperations (ERC-4337).** `MiniKit.sendTransaction` returns a **userOpHash**, not a conventional `txHash`, so the usual `tx.wait()` pattern does not apply. The server resolves the userOp through the World Developer Portal:

```
GET https://developer.world.org/api/v2/minikit/userop/{userOpHash}
```

This endpoint is public (no API key required). Public RPC endpoints generally **reject** `eth_getUserOperationByHash` (e.g. Alchemy's public WorldChain RPC answers `401: Only core evm requests are allowed.`), which is why resolution goes through the Developer Portal.

`src/app/api/verify-payment/route.ts` accepts either a `txHash` (web / EOA) or a `userOpHash` (World App) and answers:

- `202 Accepted` — userOp still pending,
- `422 Unprocessable Entity` — userOp reverted,
- `200 OK` — resolved; the resulting `transaction_hash` is then verified on-chain before the membership is granted.

> ⚠️ **Known limitation — do not enable with real funds yet.** The userOp path is not fully hardened:
> - The endpoint performs a **single** lookup; a userOp that is still `pending` at that instant returns `202` and the client does not retry, so users can be charged without their membership being activated.
> - Once resolved, the code re-checks the **top-level transaction** (`tx.to === PLATFORM_WALLET`, `tx.value >= fee`). For ERC-4337 the top-level transaction targets the **EntryPoint** with `value = 0`, so these checks do not describe what the user actually signed. Sender, recipient and amount must be validated from the userOp/bundler response instead.
> - `src/components/bookings/booking-list.tsx` writes the `userOpHash` as `paymentTxHash` and marks booking deposits/refunds as **confirmed immediately**, without server-side verification. This must be replaced by a confirmed-on-chain check before it can be considered safe.
>
> Recommended fix: verify the userOp against the Developer Portal / bundler response (sender, `to`, value), poll until terminal, and only then activate the membership or flip the booking status. See `docs/TROUBLESHOOTING.md` for userOp-specific errors.

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
