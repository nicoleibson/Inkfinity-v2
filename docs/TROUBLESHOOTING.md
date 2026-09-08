# Troubleshooting Common Issues

This document provides solutions for common problems you might encounter while developing and running the Inkfinity platform.

---

## Camera: "Camera Not Supported Here" / "dispositivo no detectado"

### Problem
Activating facial verification shows a camera error and no preview ever appears. On a phone (e.g. iPhone) this typically shows as "Camera Not Supported Here" or simply "no device".

### Cause
The most common cause is **opening the app over HTTP** instead of HTTPS. Browsers only expose `navigator.mediaDevices` to secure contexts (HTTPS or `localhost`). Opening `http://192.168.x.x:9002` from a phone over your LAN hits this immediately.

Other causes, in order of frequency:
1. **Insecure context (HTTP)** — `getUserMedia` is not available at all.
2. **Camera permission denied** — by the browser (site settings) or by the OS (macOS System Settings → Privacy & Security → Camera; Windows Settings → Privacy → Camera).
3. **Camera already in use** — another application (video call, etc.) holds the device.

### Solution
- Use **HTTPS**: deploy to App Hosting (`docs/DEPLOYMENT.md`) or run `cloudflared tunnel --url http://localhost:9002` / `ngrok http 9002` and open the `https://` URL on the phone.
- Check the browser/OS camera permissions and reload the page.
- Close apps using the camera.
- Uses `src/lib/client/camera.ts`, which detects the specific cause and shows a **targeted toast + persistent banner with a "Try Again" button** (`face-verifier.tsx`, `settings/page.tsx`). Read the banner text: it tells you which of the cases above it is.

---

## Email link fallback: "No pending email found" / invalid link

### Problem
Clicking "Email me a secure link" and then the emailed link shows an error on `/verify-face/email-link`.

### Cause / Solution
1. **Domain not authorized:** `sendSignInLinkToEmail` requires the app to run on an **authorized domain** (Firebase Console → Authentication → Settings → Authorized domains). Add your deployed/App Hosting domains.
2. **Different device/browser:** the legacy flow required the same browser tab (email stored in `localStorage`). This is now **supported**: the email is embedded in the link URL, so opening it on another device works — as long as account settings match and the link is fresh.
3. **Already-verified session:** if the login was already completed, the link is single-use. Request a new one from `/verify-face`.

---

## "Invalid Server Actions request" on the deployed site

### Problem
Server actions (`verifyFace`, `geocodeAddress`) are rejected with a `Next 400 / Invalid Server Actions request` error only on the deployed domain (works on `localhost`).

### Cause
Next.js only accepts Server Action requests from origins listed in `serverActions.allowedOrigins` in `next.config.js`. The deployed domain is missing.

### Solution
Add the production origin(s) to `serverActions.allowedOrigins` in `next.config.js`:

```js
serverActions: {
  allowedOrigins: ["your-domain.example", "https-app-host.r.appspot.com", "*.web.app"],
},
```

Then rebuild and redeploy.

---

## WalletConnect "Origin Not Allowed" Error

### Problem
When you try to connect your wallet, the connection fails, and you see an error in the browser's console that looks like this:

`Error: WebSocket connection closed abnormally with code: 3000 (Unauthorized: origin not allowed)`

### Cause
This is a security feature from the WalletConnect cloud service, not a bug in the application code. Your project on their platform will only accept connection requests from domains (also called "origins") that you have explicitly approved. Because your development environment runs on a dynamic URL, you must add it to the allowlist.

### Solution
Follow these steps to add the current URL to your Reown project's allowlist:

1.  **Go to the Reown Dashboard:** Open a new browser tab and navigate to [https://dashboard.reown.com/](https://dashboard.reown.com/).

2.  **Select Your Project:** Log in and select the project for this application (project ID `fedf6cd812a74a885931241545a8120d`).

3.  **Go to App Configuration:** Open **App Configuration → Domains** (este es el allowlist de Reown; el proyecto de Reown Cloud ya recoge estas entradas).

4.  **Add the Origin URL:**
    *   Find the section named **Allowed Domains** (o **Allowed Origins**).
    *   Añade el host de la URL actual (ej. `ssrinkfinity2d470-no4spoqgaq-uc.a.run.app`, `inkfinity-2d470.web.app`).

5.  **Add Localhost (Recommended):** While you are here, it's a good idea to also add your local development URL so you can run the project on your own machine in the future:
    ```
    localhost:9002
    ```

6.  **Save and Refresh:** Save the changes on the Reown dashboard. Then, return to your development workspace tab and **refresh the page**. The wallet connection should now work correctly.

> Si el error aparece solo en un túnel puntual (cloudflared/ngrok), el dominio cambia en cada lanzamiento: añade el host de ese túnel o usa el flujo sin Project ID (que cae a `window.ethereum`, sin requirenir de Reown).
