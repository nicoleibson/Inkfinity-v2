# Inkfinity - Tattoo Art Marketplace

Inkfinity is a modern, feature-rich web application built with Next.js and Firebase, designed as a comprehensive marketplace and community platform for the tattoo industry. It connects tattoo artists, studios, and clients in a single, decentralized ecosystem.

This project was built to showcase the integration of modern web technologies, including a robust front-end with React and ShadCN UI, a secure and scalable backend with Firebase (Authentication, Realtime Database), decentralized image storage via Google Drive and IPFS, and advanced AI-powered features using Google's Genkit.

---

## Estado Actual y Promoción de Lanzamiento

**¡Atención!** La plataforma Inkfinity se encuentra actualmente en fase de desarrollo activo.

Como agradecimiento a nuestros primeros seguidores y para celebrar nuestro futuro lanzamiento, nos complace ofrecer una promoción especial: **todas las cuentas que se encuentren con su membresía o pago de registro al día en el momento del lanzamiento oficial recibirán una membresía extendida de 1 año sin costo adicional.**

Esta promoción es válida para todas las activaciones y renovaciones realizadas hasta **diciembre de 2026**.

---

## Key Features

*   **Role-Based User System:** Distinct roles for Clients, Tattoo Artists, Studios, and Supply Stores, each with a tailored user experience.
*   **AI-Powered Onboarding & Content Creation:** New users get AI-generated bios, and artists receive AI assistance for artwork titles, descriptions, and tags.
*   **Advanced Artwork & Digital Asset Management:** Artists can upload their portfolios and list existing NFTs for sale.
*   **Web3 Integration:** Secure, peer-to-peer transactions for artwork sales, memberships and booking deposits in **WLD on WorldChain** using **native Worldcoin MiniKit + SIWE inside the World App** (ERC-4337 userOperations). WalletConnect/Reown and injected-extension flows were **removed**; the only supported payment path is the World App MiniApp. The network is configurable and also supports WorldChain Sepolia, Polygon and Amoy.
*   **Booking & Scheduling System:** Clients can book appointments with artists, who can manage their requests and availability settings through a dedicated dashboard.
*   **Admin-to-User Chat:** Real-time messaging restricted to communication between administrators and users for platform support. Users contact each other via their social media links (WhatsApp, Instagram, Telegram) displayed on their profiles.
*   **Comprehensive Admin & Moderation Panel:** Tools for administrators to manage users, configure platform settings (including the active blockchain network), and moderate content. Includes a dedicated DB Cleanup module (`/admin/cleanup`) and terminal scripts (`run-cleanup.sh`) to purge obsolete data.
*   **Security-First Approach:** Features include AI-powered content moderation, NFT ownership verification, multi-session detection, and re-authentication for sensitive admin actions. **World ID** is now used for 2FA, replacing the previous facial‑scan flow. See [`docs/WORLD_ID_INTEGRATION.md`](docs/WORLD_ID_INTEGRATION.md).

## Tech Stack

*   **Framework:** [Next.js](https://nextjs.org/) (with App Router)
*   **UI:** [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [ShadCN UI](https://ui.shadcn.com/), [Tailwind CSS](https://tailwindcss.com/)
*   **Hosting:** [Vercel](https://vercel.com) — canonical domain `https://inkfinity-ten.vercel.app`
*   **Backend & Database:** [Firebase](https://firebase.google.com/) (Authentication, Realtime Database). *Firebase Storage was fully removed as image store; images live in each user's Google Drive account (via OAuth, module `src/lib/google-drive.ts`) and NFT artworks on IPFS (`src/lib/ipfs.ts`). Firebase is **not** the web host.*
*   **Generative AI:** [Google AI & Genkit](https://firebase.google.com/docs/genkit)
*   **Client-side ML:** [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision) (face detection + face landmarker for liveness), served from `public/models/`. (The former face-api.js embedding layer was removed.)
*   **Web3:** [Ethers.js](https://ethers.io/) for wallet interactions and [Worldcoin MiniKit](https://docs.world.org/minikit) (native SIWE + ERC-4337 userOperations inside the World App). WalletConnect/Reown and injected-extension wallets were **removed**.
*   **Blockchain:** [WorldChain](https://world.org) mainnet (chain ID 480, native token **WLD**).

## Getting Started

To get the project up and running locally, please refer to the detailed instructions in the `docs/` directory:

1.  **`docs/SETUP.md`**: Firebase CLI link, the full `.env.local` reference (Firebase, WorldChain RPCs, World App IDs), and Git setup.
2.  **`docs/DEPLOYMENT.md`**: Deploying to **Vercel** (environment variables, authorized domains, World App domain allowlist, WorldChain settings, CSP) so camera + facial 2FA + email link and payments work on real devices.
3.  **`docs/FACIAL_VERIFICATION.md`**: Standalone, reproducible reference for the **facial 2FA system** (layered pipeline, API contract, thresholds, data model, env vars, CSP).
4.  **`docs/ADVANCED_INTEGRATIONS.md`**: Server-side logic and AI flows, plus the **WorldChain + MiniKit** architecture and the current limitations of the userOp payment verification.
5.  **`docs/SECURITY.md`**: An in-depth overview of the platform's security architecture.
6.  **`docs/TROUBLESHOOTING.md`**: Common issues — camera/HTTPS, Firebase JSONP CSP, geolocation, World App SIWE, `no such account`, and userOperation verification.

---

## Workspace Cleanup Guide

To ensure a clean start in a new environment or to resolve caching issues, follow these steps to clear all generated files and re-install dependencies. Run these commands in your terminal from the project's root directory:

1.  **Remove Next.js cache:**
    ```bash
    rm -rf .next
    ```

2.  **Remove installed packages:**
    ```bash
    rm -rf node_modules
    ```

3.  **Re-install all dependencies:**
    ```bash
    npm install
    ```

After these steps, you can start the development server as usual with `npm run dev`. This process effectively resets your local workspace to a pristine state, just as if you had cloned it for the first time.

---

This project serves as a comprehensive example of building a modern, full-stack application. Feel free to explore the code to see how these different technologies are integrated to create a cohesive and powerful user experience!
