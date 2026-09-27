
# Project Setup

This document contains setup instructions for the project: Firebase CLI, environment variables, GitHub, and the World App / WorldChain setup.

---

## Firebase CLI Configuration

Follow these steps to set up the Firebase Command Line Interface (CLI), which allows you to manage and deploy your Firebase project from your terminal.

### Step 1: Install the Firebase CLI

First, install the Firebase CLI globally on your machine using npm (Node Package Manager). Open your terminal or command prompt and run:

```bash
npm install -g firebase-tools
```
*If you encounter permission errors, you may need to run this command with `sudo` on macOS/Linux or use an administrator command prompt on Windows.*

### Step 2: Log in to Firebase

Next, log in to your Google account through the CLI. This command will open a browser window for you to authenticate.

```bash
firebase login
```
Select the Google account associated with your Firebase project.

### Step 3: Initialize Firebase in Your Project

Navigate to your project's root directory in the terminal. If you haven't already, you need to link this local project to your Firebase project on the cloud.

Run the initialization command:
```bash
firebase init
```

The CLI will ask you a series of questions:

1.  **Which Firebase features do you want to set up?**
    *   Use the arrow keys to navigate. Press the spacebar to select:
        *   `Realtime Database Security Rules`
    *   Press `Enter` to confirm.

2.  **Please select an option:**
    *   Select `Use an existing project`.

3.  **Select a default Firebase project for this directory:**
    *   Choose your Firebase project from the list.

4.  **What file should be used for Database Rules?**
    *   Press `Enter` to accept the default (`database.rules.json`).

5.  **Set up automatic builds and deploys with GitHub?**
    *   Type `N` (for No) and press `Enter`.

> **Note:** do **not** initialise Firebase Hosting. The web app is served by **Vercel** (`https://inkfinity-ten.vercel.app`); Firebase is only used for Authentication, Realtime Database and Storage rules. The `hosting` block that remains in `firebase.json` is legacy and must not be deployed.

This will create the `.firebaserc` file, linking your local code to your Firebase project.

### Step 4: Deploy Your Rules

Firebase rules are the only thing deployed through the Firebase CLI:

```bash
firebase deploy --only database
firebase deploy --only storage
```

To deploy your entire application (including the web app and all rules), run:

```bash
firebase deploy
```

---

## Environment Variables

The app reads the Firebase web SDK configuration and other keys from `NEXT_PUBLIC_*` environment variables (`src/lib/firebase-config.ts`). Copy `.env.local` from the repo or create it with these keys:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GEMINI_API_KEY=
# Canonical site URL (production: https://inkfinity-ten.vercel.app).
# Used by AppKit metadata.url, NFT metadata external_url and OpenGraph canonicals.
NEXT_PUBLIC_SITE_URL=https://inkfinity-ten.vercel.app
# Platform treasury address — MUST be a World Chain (chainId 480) address when
# the network is set to WorldChain Mainnet, otherwise payments revert.
NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS=
# Reown AppKit (WalletConnect) - optional, enables mobile wallet connect (see docs/DEPLOYMENT.md §1.5)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# --- World App / Worldcoin MiniKit (docs/ADVANCED_INTEGRATIONS.md) ---
# App ID from https://developer.world.org. Required for MiniKit.install().
NEXT_PUBLIC_WORLD_APP_ID=
# Relying Party ID from the same Developer Portal (World ID / IDKit).
WORLD_RP_ID=

# Server-side (NO NEXT_PUBLIC — nunca exponer en el bundle del cliente):
# El server (verify-payment) recalcula el fee con settings + descuento de
# referido y verifica la tx on-chain ANTES de activar la membresía.
# Si no se configuran, usa fallbacks públicos documentados en
# src/app/api/verify-payment/route.ts (RPC público de Alchemy para WorldChain).
RPC_WORLDCHAIN_URL=https://worldchain-mainnet.g.alchemy.com/public
RPC_WORLDCHAIN_SEPOLIA_URL=https://worldchain-sepolia.g.alchemy.com/public
RPC_AMOY_URL=https://rpc-amoy.polygon.technology
RPC_POLYGON_URL=https://polygon-rpc.com
# Bundler para verificar el recipient/importe exactos de una userOp (ERC-4337).
# Los RPC públicos de WorldChain rechazan eth_getUserOperationByHash
# (401: Only core evm requests are allowed.) y no hay bundler público para World Chain.
# Sin esta variable los pagos de la World App se validan con un delta de saldo.
RPC_WORLDCHAIN_BUNDLER_URL=
RPC_WORLDCHAIN_SEPOLIA_BUNDLER_URL=
# Precio de referencia para depósitos de reserva (denominados en USD). Default: CoinGecko.
PRICE_API_BASE_URL=https://api.coingecko.com/api/v3/simple/price
# Solo local: habilita el precio fijo heredado (3500 USD). NUNCA en producción.
ALLOW_MOCK_PRICES=
# Dirección de la wallet de la plataforma (server-side). Si se omite, se usa
# NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS como "tx.to" esperada.
PLATFORM_WALLET_ADDRESS=
# Service account del Admin SDK (escrituras server-side en RTDB).
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
# Genkit AI (server-side):
GEMINI_API_KEY=
```

> **Important for deployment:** Vercel does **not** read `.env.local`. The `NEXT_PUBLIC_*` variables must be set in **Vercel → Project → Settings → Environment Variables** (they are inlined at build time). See `docs/DEPLOYMENT.md`.

> **Build memory:** the production bundle is heavy (AppKit/WalletConnect + MiniKit). If `npm run build` fails with a worker crash or OOM, it's low memory — the `build` script already sets `NODE_OPTIONS='--max-old-space-size=1536'`.

## Mobile wallet connect (WalletConnect / Reown AppKit)

Optional. When `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set, "Connect Wallet" opens the Reown AppKit modal: mobile users get a QR code or a deep link to their wallet app (Android/iOS); desktop still supports injected extensions (e.g. MetaMask) through the modal. Without the Project ID the app keeps the legacy `window.ethereum` extension-only flow.

To get a Project ID and configure allowed domains, see `docs/DEPLOYMENT.md` §1.5.

## World App (Worldcoin MiniKit)

When the app runs inside the World App, `src/lib/world-app.ts` detects it (`MiniKit.isInWorldApp()`) and the wallet layer switches to **MiniKit + SIWE** instead of AppKit. There is no QR code and no injected provider: the World App supplies the EIP-1193 provider itself.

Requirements:

1. `NEXT_PUBLIC_WORLD_APP_ID` (from <https://developer.world.org>) — used by `MiniKit.install()`.
2. `WORLD_RP_ID` (same portal) if World ID / IDKit will be used. MiniKit itself does not consume it.
3. **Register the site domain in the Developer Portal.** MiniKit derives the SIWE `domain` and `uri` from `window.location`, and the World App rejects unregistered domains. Localhost works only with a dev-app; for a real device use the deployed Vercel domain.

In-World-App behaviour:

- Login prompts an SIWE signature; `eth_requestAccounts` and `eth_chainId` (480) route through MiniKit.
- Payments use `MiniKit.sendTransaction`, which returns a **userOpHash** (ERC-4337), not a conventional `txHash`. See `docs/ADVANCED_INTEGRATIONS.md` for the verification pipeline and its current limitations.
- Transactions cannot be awaited with `tx.wait()`; the userOp must be resolved through the Developer Portal.

## Camera & HTTPS (facial verification 2FA)

The facial 2FA feature requires a **camera** and therefore a **secure context**:

- **Local development:** run on `localhost` (secure-context exemption): `npm run dev` → http://localhost:3000
- **Real devices (phone):** the app must be served over **HTTPS**. Testing over `http://<your-ip>:3000` will fail with "Camera Not Supported Here". Use the deployed Vercel URL or a tunnel (`cloudflared`, `ngrok`); see `docs/DEPLOYMENT.md`.

## GitHub Configuration

These are the steps to connect this project to its GitHub repository.

### Step 1: Initialize Git

If not already done, initialize a Git repository in your project's root directory.

```bash
git init
```

### Step 2: Connect to GitHub

If you get an error saying "remote origin already exists", use the `set-url` command.

1.  **Add or Update the remote URL.**
    ```bash
    git remote set-url origin https://github.com/nicoleibson/Inkfinity-aistudio.git
    ```

2.  **Ensure your local branch is named `main`.**
    ```bash
    git branch -M main
    ```

3.  **Add and Commit your changes.**
    ```bash
    git add .
    git commit -m "Github connection and project files"
    ```

### Step 3: Handle "Unrelated Histories" and "Protected Branch"

If GitHub initialized the repository with a README or LICENSE, you will see errors when pushing. Follow these steps to resolve them:

1.  **Pull remote changes allowing unrelated histories:**
    GitHub repositories often start with a commit. Your local project has its own history. Merge them with:
    ```bash
    git pull origin main --allow-unrelated-histories
    ```
    *If a text editor (Nano/Vim) opens for a merge message, save and exit (`Ctrl+O`, `Enter`, `Ctrl+X` in Nano).*

2.  **Push your code:**
    ```bash
    git push -u origin main
    ```

> Connecting `main` to Vercel means every push triggers an automatic build and deploy. Remember that `NEXT_PUBLIC_*` variables are inlined at **build** time: after changing one in the Vercel dashboard you must redeploy (rebuild) for it to take effect. See `docs/DEPLOYMENT.md` §1.

### Troubleshooting: "Protected Branch" Error

If you see `protected branch` or `You are not allowed to force push code to a protected branch`:

1.  **Avoid Force Push:** Do not use `git push -f`. Use the `git pull ... --allow-unrelated-histories` method above instead.
2.  **Unprotect Branch (If you really need to force push):** 
    *   Go to your repository on GitHub.
    *   Navigate to **Settings > Branches**.
    *   Expand **Protected branches**.
    *   Click **Unprotect** for the `main` branch.
    *   Try your push again.
    *   **Important:** Protect the branch again after you finish.

Your project is now successfully connected to GitHub!
