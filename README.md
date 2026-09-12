# Inkfinity - Tattoo Art Marketplace

Inkfinity is a modern, feature-rich web application built with Next.js and Firebase, designed as a comprehensive marketplace and community platform for the tattoo industry. It connects tattoo artists, studios, and clients in a single, decentralized ecosystem.

This project was built to showcase the integration of modern web technologies, including a robust front-end with React and ShadCN UI, a secure and scalable backend with Firebase (Authentication, Realtime Database, Storage), and advanced AI-powered features using Google's Genkit.

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
*   **Web3 Integration:** Secure, peer-to-peer transactions for artwork sales and booking deposits using cryptocurrency on a configurable network (Polygon or Amoy testnet).
*   **Booking & Scheduling System:** Clients can book appointments with artists, who can manage their requests and availability settings through a dedicated dashboard.
*   **Direct User-to-User Chat:** Real-time messaging for seamless communication between all user types.
*   **Comprehensive Admin & Moderation Panel:** Tools for administrators to manage users, configure platform settings, and moderate content.
*   **Security-First Approach:** Features include AI-powered content moderation, NFT ownership verification, multi-session detection, and re-authentication for sensitive admin actions. Optional **facial scan 2FA** uses a multi-layer chain: client-side face detection (MediaPipe), liveness detection (blink + head motion), deterministic face embeddings (face-api), a 3-frame AI comparison with confidence scoring (Genkit/Gemini), escalating rate limiting, and an email-link fallback.

## Tech Stack

*   **Framework:** [Next.js](https://nextjs.org/) (with App Router)
*   **UI:** [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [ShadCN UI](https://ui.shadcn.com/), [Tailwind CSS](https://tailwindcss.com/)
*   **Backend & Database:** [Firebase](https://firebase.google.com/) (Authentication, Realtime Database, Cloud Functions). *Firebase Storage uploads were disconnected; images travel as data URIs.*
*   **Generative AI:** [Google AI & Genkit](https://firebase.google.com/docs/genkit)
*   **Client-side ML:** [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision) (face detection + face landmarker) and [face-api.js](https://vladmandic.github.io/face-api/face-api.js/) (face embeddings), served from `public/models/`.
*   **Web3:** [Ethers.js](https://ethers.io/) for wallet interactions + [Reown AppKit](https://docs.reown.com/appkit) (WalletConnect) for connecting mobile wallets (Android/iOS deep links / QR), with fallback to injected extensions (`window.ethereum`).

## Getting Started

To get the project up and running locally, please refer to the detailed instructions in the `docs/` directory:

1.  **`docs/SETUP.md`**: Contains all the necessary steps for configuring your Firebase project, installing dependencies, and linking your local environment.
2.  **`docs/DEPLOYMENT.md`**: Guide for deploying to Firebase App Hosting (HTTPS, environment variables, authorized domains) so camera + facial 2FA + email link work on real devices.
3.  **`docs/SECURITY.md`**: Provides an in-depth overview of the platform's security architecture.
4.  **`docs/TROUBLESHOOTING.md`**: Offers solutions for common issues, such as WalletConnect configuration and camera/HTTPS problems.
5.  **`docs/ADVANCED_INTEGRATIONS.md`**: Describes how server-side logic is implemented with Firebase Functions for tasks like user synchronization.

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
