# World App MiniApp Submission & Developer Portal Guide

This guide details the exact configurations, assets, and checks required to submit **Inkfinity** for review and listing on the **World App** store via the World Developer Portal (`developer.world.org`).

> The copy-paste submission text (description, changelog, permissions rationale and reviewer walkthrough) lives in [`docs/MINIAPP_CHANGELOG.md`](MINIAPP_CHANGELOG.md). Keep both files in sync.

---

## 1. App Information & Branding Assets

### Metadata
- **App Name:** Inkfinity
- **Subtitle / Tagline:** Tattoo artists, studios and clients in one place
- **Category:** Social / Marketplace / Creative
- **Developer / Team Name:** Inkfinity Core Team
- **Support Email:** `support@inkfinity.app` (must match privacy policy and handle user inquiries)
- **Official Website:** `https://inkfinity-ten.vercel.app`
- **Privacy Policy URL:** `https://inkfinity-ten.vercel.app/privacy`
- **Terms & Conditions URL:** `https://inkfinity-ten.vercel.app/terms`

### Required Graphic Assets
- **App Icon:**
  - Format: PNG (transparent background)
  - Dimensions: 512 x 512 px (minimum) / 1024 x 1024 px (recommended)
  - Style: Clean, legible at small mobile sizes (e.g. Inkfinity gradient logo)
- **Cover / Header Banner:**
  - Dimensions: 1200 x 630 px (1.91:1 aspect ratio) or 1920 x 1080 px
  - Content: Tattoo artwork showcase, no clutter
- **Screenshots (Mobile View):**
  - Minimum of 3 and up to 5 screenshots taken from mobile / MiniApp view:
    1. Home / Discover feed with trending tattoo styles & artists
    2. Artist portfolio & booking consultation screen
    3. WLD payment confirmation via MiniKit
    4. Profile with the World ID verified badge

---

## 2. Technical Configuration in Developer Portal

### A. Environment & Target URLs
- **Production URL:** `https://inkfinity-ten.vercel.app`
- **Staging / Simulator URL:** For local testing using World App Simulator (`staging`).

### B. World ID Action
- **`inkfinity-account`** — the single action requested by the app: signup and login (unauthenticated RP context, `POST /api/auth/worldid/rp-context`), and linking World ID from Settings (authenticated, `POST /api/worldid/rp-context`).
- **Verification Level:** Orb proof (`orbLegacy()`), which yields the uniqueness nullifier.
- The value is defined once in `src/lib/worldid-action.ts`. `inkfinity-auth` may still be listed in the portal, but the app does not request it. See [`docs/WORLD_ID.md`](WORLD_ID.md).

### C. Contract & Token Whitelisting
Under the MiniKit / Payments section in the portal:
- **Blockchain:** World Chain (Mainnet - Chain ID: `480`)
- **Token Contract (WLD):**
  - `0x2cFc85d8E48F8EAB294be644d9E25C3030863003` (World Chain Mainnet WLD ERC-20)
- **Recipient Wallet Address:** The Inkfinity treasury EOA, configured with `NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS` (server fallback: `PLATFORM_WALLET_ADDRESS`). It is a plain account that receives WLD, not a contract.
- **Only this token:** the app transfers WLD and calls only the WLD contract. No other token or contract is used.

---

## 3. MiniKit Compliance & Review Checklist

- [x] **No Popups / External Redirections:** Navigation stays strictly within the World App WebView.
- [x] **Public Entry Point (`/`):** The root route `/` loads instantly without forcing login.
- [x] **Wallet Handling:** `isInWorldApp()` gates every wallet action; inside World App transactions use the native dialog, outside it the app asks the user to open World App instead of falling back to a browser wallet.
- [x] **Anti-Replay Verification:** World ID proofs are hashed and validated atomically in the backend.
- [x] **Data Privacy & GDPR / World Compliance:** Dedicated `/privacy` page published and visible in navigation.
- [x] **No Token Pre-Sales:** The platform only facilitates booking deposits and artist subscriptions in WLD; no token sales or prohibited investments.
