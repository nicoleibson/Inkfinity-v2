# Inkfinity — Mini App submission & changelog

Copy-paste source for the fields in the World Developer Portal (**Mini App →
Submit for review**). Written to match World's App Review Guidelines: plain
language, accurate scope, no "beta" framing, clear World ID and payment story.

---

## Submission fields

| Field | Value |
| --- | --- |
| **App name** | `Inkfinity` |
| **Category** | Marketplace / Community |
| **Production URL** | `https://inkfinity-ten.vercel.app` |
| **Version** | `1.0.0` — initial submission |
| **Release date** | 2026-11-11 |
| **Support contact** | `support@inkfinity.app` |
| **Languages** | English, Spanish |

### Short description (≤ 25 words)

> Find tattoo artists and studios, book appointments, and pay in WLD. One
> verified person per account.

### Long description

Inkfinity is a marketplace and community for the tattoo industry. Clients
discover artists and studios, browse portfolios, follow profiles, book
appointments and pay deposits directly in WLD on World Chain. Tattoo artists,
studios and supply stores publish their work, manage bookings and sell digital
artwork. Every account can be verified with World ID, so one real person maps to
one account.

---

## Changelog

### v1.0.0 — Initial Mini App submission

**Human verification**

- Added **World ID 4.0** as the proof-of-humanity layer for account signup,
  login and account linking.
- Two actions are registered in the Developer Portal and used by the app:
  `inkfinity-auth` (signup/login) and `inkfinity-account` (link an existing
  account from Settings).
- The backend issues the RP signature and verifies every proof server-side. The
  client never decides the outcome, and no biometric data reaches our servers.
- Each proof produces a nullifier scoped to `(app, action)`. It is normalized and
  linked atomically to a single account, which blocks duplicate and sybil
  accounts.
- Anti-replay: each IDKit payload is hashed and claimed in a transaction before
  verification, so a proof cannot be reused.
- Removed the previous face-based second factor (MediaPipe + Gemini) and its
  assets and endpoints, replacing them with World ID.

**Payments**

- Memberships, registration fees and booking deposits are paid in **WLD** on
  World Chain (chain ID 480) through `MiniKit.sendTransaction`.
- Removed every other wallet path: WalletConnect/Reown and injected-browser
  wallets are gone. Inside World App the only payment path is MiniKit.
- Every transfer is verified server-side by resolving the user operation and
  checking the exact recipient and amount before the payment is marked as paid.

**Marketplace and community**

- Profiles for clients, tattoo artists, studios and supply stores, with
  portfolios, followers, likes and reviews.
- Booking requests with artist-managed availability and deposit payments.
- Artwork and digital-asset listings, with NFT ownership checks for existing
  collections.
- Referral program: referral codes, discounts at checkout, weekly commission
  tracking and WLD payouts to referrers executed by platform administrators.
- Support chat between administrators and users, plus a moderation and
  administration panel.

**Mini App specifics**

- Mobile-first layout: tab navigation, no sidebars or footers, responsive
  screens sized for World App.
- Requested permissions are deliberately minimal — see below.

---

## World ID usage (for reviewers)

1. The app asks the backend for a signed RP context (`POST
   /api/auth/worldid/rp-context`).
2. IDKit opens with that context in **production** environment.
3. The proof returned by World App is forwarded **verbatim** to the backend,
   which verifies it against World's verifier (`/api/v4/verify`).
4. A valid proof sets `worldIdVerified` on the account and records the nullifier
   in a server-only index. A nullifier already tied to another account is
   rejected.

The app never receives or stores iris codes, face images, documents or
biometric templates. It keeps only a boolean flag on the profile and the
pseudonymous nullifier in a non-public database path.

---

## Permissions requested and why

| Permission | Used for |
| --- | --- |
| **World ID** (IDKit) | Prove the user is a unique human at signup/login and when linking from Settings |
| **Wallet authentication** (SIWE, `eth_requestAccounts`) | Link the user's World Wallet address to their profile so payments and payouts target the right account |
| **Send transaction** | Pay membership, registration fees and booking deposits in WLD |

Not requested: notifications, contacts, microphone, chat, address book,
usernames.

**Permit2 tokens:** `0x2cFc85d8E48F8EAB294be644d9E25C3030863003` (WLD, 18
decimals) — the only token the app transfers.

**Contract entrypoints:** `0x2cFc85d8E48F8EAB294be644d9E25C3030863003` (WLD
ERC-20 contract). The app calls `transfer(address,uint256)` on it; no other
contract is invoked from the Mini App. Treasury wallets are plain accounts that
receive WLD, not contracts.

---

## Data collected

- Email and account profile (role, bio, links, avatar) provided by the user.
  Signup requires email verification; Google sign-in is also supported.
- Portfolio images and artwork metadata the user uploads.
- Booking and payment records (amounts, hashes, timestamps).
- World ID verification flag and pseudonymous nullifier.

No biometric data, no location tracking, no third-party advertising SDKs.

---

## How to test (reviewer walkthrough)

1. Open the app inside World App and sign up with World ID (Orb or simulator).
2. Browse the home feed, open a profile and a portfolio item.
3. Create a booking as a client; the deposit step opens the WLD payment sheet.
4. Go to **Settings → Proof of Humanity** to link World ID to an existing
   account and confirm the badge appears on the profile.
5. Sign out and back in with World ID.
6. Re-use a previous proof: it is rejected as a replay.
7. Sign up with a World ID already linked to another account: the request is
   rejected.

Payments move real WLD on World Chain. Use a small amount when testing.

---

## Pre-submission checklist

- [x] Support email set to `support@inkfinity.app` (same address published in the
      privacy policy).
- [x] Public copy no longer describes the app as a demo, beta or work in progress.
- [ ] Confirm both actions (`inkfinity-auth`, `inkfinity-account`) exist in the
      Developer Portal for the same app.
- [ ] Confirm the production domain is registered and the Mini App permissions
      list only the WLD token and WLD contract above.
- [ ] Run the reviewer walkthrough above inside World App end-to-end.
- [ ] Keep contact details up to date so the review team can reach you.

---

## Template for future releases


> **vX.Y.Z — YYYY-MM-DD**
>
> - Added: …
> - Changed: …
> - Fixed: …
> - Removed: …
> - Permissions added or removed: … (say "none" if unchanged)

Keep each line user-visible and free of internal jargon; the review team reads
this to understand what changed between submissions.
