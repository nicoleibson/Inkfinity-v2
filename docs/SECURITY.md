# Inkfinity Platform Security Overview

This document provides a comprehensive overview of the security architecture and features implemented within the Inkfinity platform. Our approach to security is multi-layered, addressing data integrity, user authentication, content moderation, and fraud prevention.

---

## 1. Authentication & Authorization

### 1.1. Firebase Authentication
- **Core System:** User sign-up and sign-in are managed by Firebase Authentication, providing a secure, industry-standard foundation for session management.
- **Providers:** Supports email/password and Google Sign-In, with secure token handling managed automatically by Firebase.
- **Email Verification:** New users must verify their email address via a link sent to their inbox. The application logic prompts unverified users to check their email upon login.

### 1.2. Role-Based Access Control (RBAC)
- **Granular Permissions:** The platform defines several user roles (`Client`, `Tattoo Artist`, `Studio`, `Supply Store`, `Administrator`, `Super-Administrator`).
- **Enforcement via Database Rules:** Firebase Realtime Database rules are the core of our authorization system. They strictly define which roles can read, write, or update specific data paths. For example, only a `Super-Administrator` can change another user's role, and only the owner of an artwork can modify its details.

### 1.3. Administrative Security
- **Tiered Admins:** The `Administrator` role is for day-to-day management, while the `Super-Administrator` role is reserved for high-impact platform configuration, such as changing the blockchain network or managing other administrators.
- **Reauthentication for Sensitive Actions:** To prevent unauthorized use of an active admin session, all critical actions require password re-entry. This is implemented for:
    - Changing a user's role or status.
    - Modifying global platform settings.
    - Signing out other user sessions.

---

## 2. User Account Security

### 2.1. Facial Scan Login (Optional 2FA)
- **Biometric Verification:** Users can optionally enable Facial Scan Login as a second factor of authentication. After a successful password login, `login/page.tsx` redirects to `/verify-face` (when `twoFactorEnabled && facialScanUrl`), and `/settings` also allows registering/verifying the face.
- **Secure Context Required:** Camera access (`getUserMedia`), liveness, and the crypto APIs only work over **HTTPS** (or `localhost`). Opening the app over HTTP (e.g. `http://192.168.x.x:3000` from a phone) is blocked by the browser — the UI surfaces this via `src/lib/client/camera.ts` diagnostics ("Camera Not Supported Here").
- **Multi-Layer Verification Chain:** The verification is not a single AI call. It is a pipeline of layered checks, each one sitting behind the previous, so the system does not rely on any single model:
  1. **Client-side face detection** (`src/lib/client/face-capture.ts`): MediaPipe `FaceDetector` (GPU with CPU fallback, local WASM) counts faces. 0 or >1 faces → rejected immediately.
  2. **Liveness / anti-spoofing** (`captureLiveSequence`): MediaPipe `FaceLandmarker` samples ~2.2s at ~9fps (input downscaled to 256px for low-end devices), requiring the face to stay visible (≥60% of samples) AND either a **blink** (`eyeBlinkLeft/Right ≥ 0.6`) or **natural 3D head motion** (≥ 4° pitch/yaw/roll). A static printed photo fails this. If the model is unavailable the check fails *open* ("unavailable").
  3. **Deterministic face embeddings** (`src/lib/client/face-recognition.ts`): face-api.js computes a 128-D descriptor from the live frame and compares it to the registered `facialDescriptor` (stored in the user's RTDB record). Euclidean distance &lt; 0.6 = match; a hard mismatch (≥ 0.6) **blocks before any AI call**. If no descriptor is registered, it fails *open*.
  4. **Generative comparison with confidence** (`src/ai/flows/verify-face-flow.ts`): Genkit/Gemini agent (`verify-face-agent.ts`) receives the registered scan **plus 3 chronological live captures** (`verify-face-schema.ts`, inputs required) and returns `isMatch` + a numeric `confidence` (0-1). Acceptance requires `isMatch && confidence ≥ 0.8`; the confidence is shown to the user.
- **Escalating Rate Limiting** (`src/lib/face-lock.ts`): every failure is recorded transactionally in `users/{uid}/facialAttempts` (`failed`, `lockedUntil`). Locks escalate: 3 failures → 30s, 5 → 5 min, 7 → 30 min (cap). Checked before every attempt on `/verify-face` and `/settings` (client + DB-enforced).
- **Email-Link Fallback** (`src/lib/email-fallback.ts`): when the camera fails or the account is locked, the user can request a **Firebase Auth email sign-in link** (`sendSignInLinkToEmail`). The email is embedded in the link URL, so clicking it works from any browser/device. `/verify-face/email-link` completes `signInWithEmailLink`, resets the failure counter, and redirects home. Requires the app to be served from an **authorized domain** (Firebase Console → Authentication → Settings → Authorized domains).
- **No Recovery Code:** the previous recovery-code flow was removed; the email link is the single camera-independent fallback.

### 2.2. Multi-Session Detection
- **Real-time Alerts:** The platform actively monitors user sessions in real-time.
- **User Notification:** If an account is detected to be active on more than one device or browser tab simultaneously, a toast notification immediately appears on all sessions, warning the user of the concurrent activity. This helps prevent account sharing and alerts users to potentially unauthorized access.

### 2.3. Automated Account Locking
- **Proactive Security:** Accounts are automatically restricted under specific conditions:
    - **Suspended Status:** Manually set by an administrator.
    - **Artist Trial Expiration:** `Tattoo Artist` accounts are moved to a `pending_payment` status if their trial period expires, requiring renewal to regain full access.

---

## 3. Content & Data Integrity

### 3.1. AI-Powered Image Moderation
- **Content Safety:** Every image uploaded to the platform is automatically scanned by an AI flow (`moderateImage`).
- **Policy Enforcement:** The AI checks for inappropriate content based on predefined safety policies (e.g., sexually explicit, hate speech). If an image is flagged, the upload is blocked, and the user is notified.

### 3.2. Image Watermarking
- **Intellectual Property Protection:** To protect artists' work, a server-side process automatically applies a discreet "Inkfinity" watermark to every uploaded artwork before it is stored in the user's Google Drive account (folder "Inkfinity Artworks") or on IPFS for NFT artworks.

### 3.3. Strict Data Validation
- **Schema Enforcement:** The `database.rules.json` file contains strict validation rules. These rules ensure that all data written to the database conforms to the expected schema (e.g., a `price` must be a number, a `booking` must have a `clientId`).
- **Prevents Corruption:** This server-side validation is crucial for preventing data corruption, both from malicious attempts and client-side bugs.

---

## 4. Web3 & Blockchain Security

### 4.1. NFT Ownership Verification
- **Fraud Prevention:** The platform includes a critical security flow (`verifyNftOwnership`) that an admin can trigger to check the blockchain.
- **Automated Delisting:** If an artist has listed a real NFT for sale on the platform but no longer owns it in their linked wallet, the system automatically marks it with an `ownershipMismatch` flag and removes it from the marketplace to prevent fraudulent sales.

### 4.2. Segregated Blockchain Networks
- **Production Safety:** A Super-Administrator can configure the entire platform to operate on **WorldChain Mainnet** (chain ID 480, native token **WLD** — for real-money transactions), on **WorldChain Sepolia**, or on the legacy **Polygon Mainnet** / **Amoy Testnet**.
- **Configuration source:** the active network is stored in `platform_settings.network` in Realtime Database and is set from `/admin`; the value persisted there takes precedence over the code default (`worldchain`). All wallet interactions and transaction verification respect the globally configured network.
- **Risk Mitigation:** This ensures that development and testing can be done safely with test funds, preventing accidental use of real assets before the platform is ready for production.
- **Native token per network:** payments are denominated in **WLD** on WorldChain and **MATIC** on Polygon/Amoy; the UI symbol follows the configured network.

### 4.3. World App Authentication (SIWE)
- **Native in-app auth:** inside the World App, authentication uses **Sign-In With Ethereum** through [Worldcoin MiniKit](https://docs.world.org/minikit) instead of a wallet-connection QR flow. The signature proves control of the account, and the SIWE `domain`/`uri` are derived from `window.location`, so the app only works on domains registered in the World Developer Portal.
- **Domain allowlisting:** an unregistered domain causes the World App to reject the SIWE challenge, which prevents phishing of the signature on look-alike domains.
- **Server-side API key handling:** MiniKit requires only a public App ID (`NEXT_PUBLIC_WORLD_APP_ID`); the Relying Party ID (`WORLD_RP_ID`) and any service credentials stay server-side and are never inlined in the client bundle.

### 4.4. Payment Verification
- **Server-side re-verification:** membership and booking payments are re-checked on-chain before access is granted. The server recomputes the expected amount from `platform_settings` (including referral discounts) and never trusts a client-sent amount.
- **Authenticated endpoints:** both `/api/verify-payment` and `/api/verify-booking-payment` use the Admin SDK, which **bypasses** `database.rules.json`. They therefore require an `Authorization: Bearer <Firebase ID token>` header and derive the acting user from the verified token, never from the request body. Without this, any caller could redeem another user's payment by guessing a hash.
- **ERC-4337 (World App) verification:** the settling transaction of a user operation targets the **EntryPoint** with `value = 0`, so `tx.to` / `tx.value` describe nothing about the payment. Verification instead relies on the EntryPoint's `UserOperationEvent` (binds the claimed `userOpHash` to a successful op and yields the sender), plus — when `RPC_WORLDCHAIN_BUNDLER_URL` is configured — the exact `to`/`value` from the userOp, bound to the claimed hash by recomputing the ERC-4337 `userOpHash` locally. Without a bundler, a recipient balance-delta check across the settling block is used instead. All three fail closed.
- **Replay protection:** each redeemed payment writes a `payment_claims/<network>:<hash>` record; re-use is rejected with `409` and identical retries are idempotent. This prevents replaying one payment to repeatedly extend a membership and farm referral commissions.
- **Confirmation depth:** regular transfers need 5 confirmations before being credited.
- **Booking settlement is server-owned:** deposits and refunds are proven by `/api/verify-booking-payment` (recipient, amount, payer identity, depth) before the booking status changes. The client no longer writes the status. `database.rules.json` additionally blocks non-admins from writing `paymentTxHash` / `cancellationTxHash` / `depositConfirmedAt` / `refundConfirmedAt`, from lowering `depositAmount`, and from setting `status: 'confirmed'` on a booking that has a deposit — otherwise the endpoint's work could simply be bypassed by writing the field directly from the browser.
- **Evidence cannot be erased:** the settlement fields are write-protected *and* the parent `.validate` blocks deleting an already-registered one — RTDB does not evaluate `.validate` on deletes, so the protection has to live in the parent. Server writes (Admin SDK) bypass rules, which is what makes the server the only path that can settle a payment.
- **Replay claims are not client-writable:** `payment_claims` has no rule of its own, so it inherits the root `.write: false`; a client cannot forge, edit or delete a settlement record.
- **Fail-closed pricing:** USD-denominated booking deposits need a reference price on both sides (`src/lib/pricing.ts`). If the server cannot obtain one it rejects with `PRICE_UNAVAILABLE` rather than accepting an unverified amount. The legacy Genkit `get-crypto-price` flow (hardcoded `3500` USD, ETH-only) is no longer used for settlement; it also used to price WLD payments with the ETH price.
- **Zero-fee grants are server-decided:** the client may only *request* the free path (`freePassage: true`); the server independently confirms the fee is zero and will not stack a trial onto an already-valid membership.
