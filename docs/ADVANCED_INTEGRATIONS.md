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

---

## Future Integrations

As the platform evolves, this section will include blueprints for:

*   **Scheduled Tasks:** Automated jobs that run periodically, such as cleaning up data, checking for expired trials, or sending summary emails.
*   **Complex Backend Logic:** Operations that require elevated privileges or are too intensive to run on the client-side, like processing payments with a third-party gateway or performing complex data aggregation.
*   **Third-Party API Integrations:** Securely interacting with external services that require private API keys. (The `GEMINI_API_KEY` secret is already wired through `apphosting.yaml`.)

Currently, the primary server-side logic runs directly inside the Next.js application, deployed via Firebase App Hosting.

### Database Maintenance & Admin Cleanup
To maintain database performance (Realtime Database), the platform includes robust administrative tools designed to purge obsolete data (such as orphaned likes, outdated bookings, legacy base64-encoded avatars, and stale aliases).
- **Web Interface:** Accessible via `/admin/cleanup` for users with Super-Administrator permissions. It scans the database and applies a patch update safely.
- **Terminal Execution:** A CLI script is provided in the project root (`cleanup-script.mjs` and `run-cleanup.sh`). It runs offline via the Firebase Client SDK authenticated via credentials passed in the terminal.
Usage: `./run-cleanup.sh "admin_email" "admin_password"`
