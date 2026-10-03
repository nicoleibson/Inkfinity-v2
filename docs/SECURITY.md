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
- **Payments are bound to a wallet, not just to a session:** a verified transfer is only credited if its on-chain sender is the wallet recorded for the account that is authenticating. Bookings compare against `clientWalletAddress` / `artistWalletAddress` (the addresses the payment is actually addressed between — *not* `clientId` / `artistId`, which are Firebase UIDs and can never match an on-chain sender); memberships compare against `users/<uid>/walletAddress`. A missing record is rejected with `MISSING_PAYER_WALLET` rather than waived, and a mismatched sender with `WRONG_SENDER`. Without this, any logged-in account could redeem a stranger's public on-chain transfer and bank the referral commission.
- **Wallet ownership is re-checked server-side:** "one wallet, one account" is only enforced in the browser (`linkWalletToAccount`), and `users` is publicly readable, so that check is bypassable — a caller could declare somebody else's wallet on their own profile and redeem that person's payment. `/api/verify-payment` therefore re-runs the lookup with the Admin SDK (indexed point reads on `walletAddress`, for the raw and lowercase forms of the sender) and rejects with `WALLET_CLAIMED_BY_ANOTHER_ACCOUNT` before crediting. This is the control that makes the sender binding meaningful rather than decorative.
- **Replay protection is atomic:** each redeemed payment writes a `payment_claims/<network>:<hash>` record through a Realtime Database transaction, so exactly one of two concurrent requests can consume a given payment reference. Both endpoints are crash-recoverable: if a process dies between consuming the claim and applying the credit, the next request for the same payment finds its own claim and finishes the settlement instead of answering "already used" to a user who just paid. Credits and settlement writes are absolute rather than deltas, so re-applying them converges instead of double-crediting. Re-use by a *different* user is still rejected with `409`.
- **Confirmation depth:** transfers and user operations alike need 5 confirmations before being credited, so a reorg cannot credit a payment that later disappears from the chain.
- **Booking settlement is server-owned:** deposits and refunds are proven by `/api/verify-booking-payment` (recipient, amount, payer identity, depth) before the booking status changes. The client no longer writes the status. `database.rules.json` additionally blocks non-admins from writing `paymentTxHash` / `cancellationTxHash` / `depositConfirmedAt` / `refundConfirmedAt`, from lowering `depositAmount`, and from setting `status: 'confirmed'` on a booking that has a deposit — otherwise the endpoint's work could simply be bypassed by writing the field directly from the browser.
- **Evidence cannot be erased:** the settlement fields are write-protected *and* the parent `.validate` blocks deleting an already-registered one — RTDB does not evaluate `.validate` on deletes, so the protection has to live in the parent. Server writes (Admin SDK) bypass rules, which is what makes the server the only path that can settle a payment.
- **Replay claims are not client-writable:** `payment_claims` has no rule of its own, so it inherits the root `.write: false`; a client cannot forge, edit or delete a settlement record. This is what makes the crash-recovery path above safe — recovery trusts the claim's recorded payment reference, which only the server could have written after verifying it on-chain. `scripts/test-booking-rules.mjs` asserts this (`payment_claims` write and read denied for clients, artists and guests).
- **No double payment from a retry:** client-side verification polls for two minutes and then gives up with `TX_PENDING`; there is no background job. The payment reference is therefore persisted (`src/lib/pending-payment.ts`, `localStorage`) and the UI replaces the "pay" button with "Check again", which re-verifies without sending anything. Repeating the request is safe because the claim is consumed atomically and an interrupted settlement is completed rather than duplicated. Entries expire after 7 days so a stale reference cannot shadow the normal payment button later.
- **Fail-closed pricing:** USD-denominated booking deposits need a reference price on both sides (`src/lib/pricing.ts`). If the server cannot obtain one it rejects with `PRICE_UNAVAILABLE` rather than accepting an unverified amount. The legacy Genkit `get-crypto-price` flow (hardcoded `3500` USD, ETH-only) is no longer used for settlement; it also used to price WLD payments with the ETH price.
- **Zero-fee grants are server-decided:** the client may only *request* the free path (`freePassage: true`); the server independently confirms the fee is zero and will not stack a trial onto an already-valid membership.

### 4.5. World ID Verification (Proof of Humanity)
- **The browser proves nothing:** World ID 4.0 requires an RP signature on every proof request, so `/api/worldid/rp-context` signs it server-side with `RP_SIGNING_KEY`. The key is never exposed to the client, and if it is absent the route answers `503 WORLDID_UNAVAILABLE` instead of issuing an unsigned request. Without this, anyone could mint proof requests appearing to come from Inkfinity.
- **Verification is server-side and fail-closed:** the client forwards the IDKit result to `/api/worldid/verify`, which posts it **verbatim** to `https://developer.world.org/api/v4/verify/{rp_id}` (World ID rejects remapped payloads or a reconstructed `verification_level`). The uid comes exclusively from the Firebase session token, never from the body, so a proof cannot be attached to somebody else's account.
- **Outages are not rejections:** responses meaning "we could not check" — network errors, timeouts, `404` (app not found/migrated), `429`, and any `5xx` — are mapped to `503 WORLDID_UNAVAILABLE`. Only a definitive verification failure becomes `400 WORLDID_REJECTED`. Silently treating a verifier outage as "not human" would lock out real users.
- **Environment is server-authoritative:** `WORLD_ID_ENVIRONMENT` (`production` by default, `staging` to use the simulator without a physical Orb) is chosen by the **server**, published to the client in the `rp_context`, and then re-checked against the environment claimed by the proof. A client-supplied environment would otherwise let anyone request simulator proofs — which do not represent a real human — and have them accepted on a production deployment.
- **One World ID, one account:** the nullifier is taken only from the verifier's response and normalised to canonical lowercase `0x` hex before use as a key (`normalizeNullifier`). The docs warn that casing/parsing differences around 256-bit nullifiers are a real source of duplicate-identity bugs, so `0xAbC…` and `0xabc…` cannot become two separate claims.
- **The claim is atomic:** `worldId_nullifiers/<nullifier>` is written through a Realtime Database transaction, so exactly one of two concurrent requests wins; a different uid re-using a claimed nullifier is aborted and answered `409`. Re-verifying with the same uid is a no-op, which is also what repairs an attempt interrupted between claiming the nullifier and updating the profile (same crash-recovery shape as `payment_claims`).
- **The raw nullifier is never in the profile:** nullifiers are stable per-(app, action) pseudonymous identifiers and `users` is publicly readable, so the nullifier lives only in `worldId_nullifiers` while the profile carries just `worldIdVerified` / `worldIdVerifiedAt`.
- **Clients cannot self-verify:** `users/<uid>` grants the owner `.write`, which would otherwise let anyone write `worldIdVerified: true` on their own profile and bypass the proof entirely. `worldIdVerified` and `worldIdVerifiedAt` are therefore protected with an admin-only **`.validate`** rule, and `worldId_nullifiers` is explicitly read/write denied for clients. `.validate` (not `.write`) is required here because Realtime Database grants cascade *down* and **cannot be revoked by a deeper rule**: an admin-only `.write` on a child still lets the owner write it, which the rules tests caught. `scripts/test-booking-rules.mjs` asserts all of this.
- **Known gap — deletion is not evaluated:** RTDB does not run `.validate` on deletes, so a user can still remove their own `worldIdVerified` flag. That is a downgrade rather than an escalation (it cannot make anyone appear verified, and the nullifier claim in `worldId_nullifiers` is unaffected), but it is a documented integrity gap rather than a solved one.

### 5.1. Privilege Escalation via `users/<uid>` (Critical, fixed)
- **Why the old rules were inert:** `users/<uid>` grants the owner `.write` (`auth.uid === $uid`). In Realtime Database, `.read`/`.write` grants **cascade down the tree and cannot be revoked by a deeper rule**. A child like `"role": { ".write": "…admin only…" }` therefore protected *nothing*: the ancestor grant already allowed the write, and the deeper rule was silently ineffective. Verified with a real emulator probe, which reported `ALLOWED` for a user writing their own `role`, `status`, `paymentDate` and `paymentTxHash`.
- **The impact was full compromise:** because `role` was owner-writable, any logged-in account could `PATCH` its own profile to `role: 'Super-Administrator'` and inherit every admin grant in this file (platform settings, referrals, admin panels). The signup `<Select>` only offers four non-privileged roles, but `formData.role` travels unvalidated — the UI was never a control. A user could likewise self-set `status: 'active'` to skip the `pending_payment` gate, and forge `paymentDate` as if membership had been paid.
- **The fix is `.validate`, not `.write`:** `.validate` rules *are* enforced after a write is granted, so admin-only `.validate` clauses on `role`, `status`, `paymentDate`, `paymentTxHash`, `worldIdVerified`, `worldIdVerifiedAt`, `referredBy`, `referralCodeUsed`, `referralCodeUsedDate`, `referralEarnings`, `referralPayouts`, `referralPayoutsDate` and `isActiveForGeofencing` now actually block the owner.
- **Creation stays legal, with constraints:** signup writes the whole profile from the client, so `role` and `status` keep a creation branch. `role` may only be set to `Client` / `Tattoo Artist` / `Studio` / `Supply Store`, and only while unset; `status` may only be created as `active` / `pending_verification` / `pending_payment`. The only post-creation change a non-admin may make is `status: 'pending_payment'` (an expired artist trial, written by the login flow). `referralCodeUsed` keeps its `false` initializer for the same reason — anything truthy is admin-only, since `verify-payment` reads it to grant a discount.
- **The delete gap needed a parent rule:** `.validate` is not evaluated on deletes, so a user could delete their own `status` and immediately rewrite it as `active`, bypassing the field-level check (whose `!data.exists()` branch would see a "new" field). `users/<uid>` therefore carries a parent `.validate` that denies a *non-admin* transition into `status: 'active'` on an already-existing profile — it compares against the previous value, so unrelated profile edits while already `active` are unaffected. `.validate` at `users/$uid` also covers deletions of the node itself, because a parent write is evaluated when a child is removed.
- **Referral integrity:** `verify-payment` reads `user.referredBy` with a fallback when a `referrals/<code>` record has a commission but no `referrerId`, and the code comment claimed "el referidor NO escribe este path: solo el server". With the inert rules, the account owner could write both `referralCodeUsed` and `referredBy`, self-applying a discount and potentially redirecting a commission to an arbitrary uid. Both are admin-only now.
- **Regression coverage:** `scripts/test-booking-rules.mjs` asserts every escalation is denied *and* that the legitimate flows still work — full signup profile creation for both `Tattoo Artist`/`active` and `Studio`/`pending_payment`, the login-time `pending_payment` transition, admin status changes and admin promotions. Two of these tests failed on the first run of the fix (signup was blocked, and the delete-then-`active` bypass was open), which is why they exist.
