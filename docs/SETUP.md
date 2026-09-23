
# Project Setup

This document contains setup instructions for the project, including Firebase and GitLab configuration.

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
        *   `Hosting: Configure and deploy Firebase Hosting sites`
    *   Press `Enter` to confirm.

2.  **Please select an option:**
    *   Select `Use an existing project`.

3.  **Select a default Firebase project for this directory:**
    *   Choose your Firebase project from the list.

4.  **What file should be used for Database Rules?**
    *   Press `Enter` to accept the default (`database.rules.json`).

5.  **What do you want to use as your public directory?**
    *   Type `.` (a single dot) and press `Enter`. This tells Firebase that App Hosting will handle the build process.

6.  **Configure as a single-page app (rewrite all urls to /index.html)?**
    *   Type `N` (for No) and press `Enter`. Next.js handles its own routing.

7.  **Set up automatic builds and deploys with GitHub/GitLab?**
    *   Type `N` (for No) and press `Enter`.

This will create the `.firebaserc` file, linking your local code to your cloud project.

### Step 4: Deploy Your Rules and Application

Now you are ready to deploy. To deploy **only** the security rules for the database, run:

```bash
firebase deploy --only database
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
NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS=
# Server-side (NO NEXT_PUBLIC — nunca exponer en el bundle del cliente):
# Ticket dellas RPC: el server (verify-payment) recalcula el fee con settings +
# descuento de referido y verifica el txHash on-chain ANTES de activar.
# Si no se configuran, usa fallbacks públicos documentados en src/app/api/verify-payment/route.ts.
RPC_AMOY_URL=https://rpc-amoy.polygon.technology
RPC_POLYGON_URL=https://polygon-rpc.com
# Dirección de la wallet de la plataforma (server-side). Si se omite, se usa
# NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS como entrada "tx.to" esperada.
PLATFORM_WALLET_ADDRESS=
# Fee base por rol (opcional; override de platform_settings.artistMembershipTiers.tier1 / etc.)
ARTIST_MEMBERSHIP_TIER1_FEE_ETH=
STUDIO_REGISTRATION_FEE_ETH=
# Reown AppKit (WalletConnect) - optional, enables mobile wallet connect (see docs/DEPLOYMENT.md §1.5)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
# Optional - overrides the AppKit metadata.url (defaults to https://inkfinity-2d470.web.app)
NEXT_PUBLIC_SITE_URL=
# Server-side (Genkit AI):
GEMINI_API_KEY=
```

> **Important for deployment:** Firebase App Hosting does **not** read `.env.local`. The `NEXT_PUBLIC_*` variables must be set as App Hosting environment variables (they are inlined at build time). See `docs/DEPLOYMENT.md`.

> **Build memory:** the production bundle is heavy (AppKit/WalletConnect bundles `viem`). If `npm run build` fails with a `PageNotFoundError: /_document` or a worker crash, it's low memory — the `build` script already sets `NODE_OPTIONS=--max-old-space-size=4096`.

## Mobile wallet connect (WalletConnect / Reown AppKit)

Optional. When `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set, "Connect Wallet" opens the Reown AppKit modal: mobile users get a QR code or a deep link to their wallet app (Android/iOS); desktop still supports injected extensions (e.g. MetaMask) through the modal. Without the Project ID the app keeps the legacy `window.ethereum` extension-only flow.

To get a Project ID and configure allowed domains, see `docs/DEPLOYMENT.md` §1.5.

## Camera & HTTPS (facial verification 2FA)

The facial 2FA feature requires a **camera** and therefore a **secure context**:

- **Local development:** run on `localhost` (secure-context exemption): `npm run dev` → http://localhost:9002
- **Real devices (phone):** the app must be served over **HTTPS**. Testing over `http://<your-ip>:9002` will fail with "Camera Not Supported Here". Use a tunnel (`cloudflared`, `ngrok`) or deploy (see `docs/DEPLOYMENT.md`).

## GitLab Configuration

These are the steps to connect this project to the GitLab repository.

### Step 1: Initialize Git

If not already done, initialize a Git repository in your project's root directory.

```bash
git init
```

### Step 2: Connect to GitLab

If you get an error saying "remote origin already exists", use the `set-url` command.

1.  **Add or Update the remote URL.**
    ```bash
    git remote set-url origin https://gitlab.com/zentec-group/nicoleibson-project.git
    ```

2.  **Ensure your local branch is named `main`.**
    ```bash
    git branch -M main
    ```

3.  **Add and Commit your changes.**
    ```bash
    git add .
    git commit -m "Gitlab connection and project files"
    ```

### Step 3: Handle "Unrelated Histories" and "Protected Branch"

If GitLab initialized the repository with a README or LICENSE, you will see errors when pushing. Follow these steps to resolve them:

1.  **Pull remote changes allowing unrelated histories:**
    GitLab repositories often start with a commit. Your local project has its own history. Merge them with:
    ```bash
    git pull origin main --allow-unrelated-histories
    ```
    *If a text editor (Nano/Vim) opens for a merge message, save and exit (`Ctrl+O`, `Enter`, `Ctrl+X` in Nano).*

2.  **Push your code:**
    ```bash
    git push -u origin main
    ```

### Troubleshooting: "Protected Branch" Error

If you see `GitLab: You are not allowed to force push code to a protected branch`:

1.  **Avoid Force Push:** Do not use `git push -f`. Use the `git pull ... --allow-unrelated-histories` method above instead.
2.  **Unprotect Branch (If you really need to force push):** 
    *   Go to your project on GitLab.com.
    *   Navigate to **Settings > Repository**.
    *   Expand **Protected branches**.
    *   Click **Unprotect** for the `main` branch.
    *   Try your push again.
    *   **Important:** Protect the branch again after you finish.

Your project is now successfully connected to GitLab!
