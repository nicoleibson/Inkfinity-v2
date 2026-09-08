// src/lib/email-fallback.ts
// Email fallback for facial verification, using ONLY the existing Firebase
// credentials. Firebase Auth sends a one-time email link through its own email
// infrastructure (the same channel already used for email verification and
// password reset). Clicking the link proves ownership of the inbox, which
// lets the user pass the 2FA step when the camera fails or they are locked out.

import { sendSignInLinkToEmail, type Auth } from "firebase/auth";

export const EMAIL_LINK_KEY = "inkfinity_email_fallback";
export const FALLBACK_LINK_PATH = "/verify-face/email-link";

export function getPendingEmail(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(EMAIL_LINK_KEY);
}

export function setPendingEmail(email: string): void {
  window.localStorage.setItem(EMAIL_LINK_KEY, email);
}

export function clearPendingEmail(): void {
  window.localStorage.removeItem(EMAIL_LINK_KEY);
}

export async function sendEmailFallbackLink(auth: Auth, email: string): Promise<void> {
  // The email is embedded in the link URL so the fallback also works when the
  // link is opened on a DIFFERENT device/browser than the one that requested it
  // (localStorage on the requesting tab does not exist there). signInWithEmailLink
  // verifies the oobCode was issued for that same email, so tampering fails safely.
  const url = new URL(window.location.origin);
  url.pathname = FALLBACK_LINK_PATH;
  url.searchParams.set("email", email);

  await sendSignInLinkToEmail(auth, email, {
    url: url.toString(),
    handleCodeInApp: true,
  });
}

/** Extracts the email embedded by sendEmailFallbackLink (if present). */
export function getEmailFromLink(link: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URL(link).searchParams.get("email");
  } catch {
    return null;
  }
}