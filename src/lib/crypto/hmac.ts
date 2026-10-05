// HMAC-SHA256 signing for the facial-verification cookies.
//
// The middleware imports this file and runs on the Edge runtime, so it must use
// Web Crypto rather than node:crypto (createHmac/timingSafeEqual are unavailable
// there). Every function is async as a result; callers must await.

const encoder = new TextEncoder();

function getSecret(): string {
  const secret = process.env.FACE_VERIFICATION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FACE_VERIFICATION_SECRET is required in production.');
  }
  return 'insecure-development-secret';
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i++) {
    binary += String.fromCharCode(view[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(payload: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await getKey(), encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

async function verifySignature(signed: string): Promise<string | null> {
  const separator = signed.lastIndexOf('.');
  if (separator <= 0) return null;

  const payload = signed.slice(0, separator);
  const provided = signed.slice(separator + 1);

  const expected = await crypto.subtle.sign('HMAC', await getKey(), encoder.encode(payload));
  const expectedBytes = new Uint8Array(expected);

  let providedBytes: Uint8Array;
  try {
    providedBytes = Uint8Array.from(atob(provided.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
      c.charCodeAt(0),
    );
  } catch {
    return null;
  }

  if (providedBytes.length !== expectedBytes.length) return null;

  let diff = 0;
  for (let i = 0; i < expectedBytes.length; i++) {
    diff |= providedBytes[i] ^ expectedBytes[i];
  }
  return diff === 0 ? payload : null;
}

export const FACE_REQUIREMENT_TTL_MS = 60 * 60 * 1000;

export async function signFaceRequirement(
  uid: string,
  requiresFaceVerification: boolean,
  expiresAt: number,
): Promise<string> {
  return sign([uid, requiresFaceVerification ? '1' : '0', String(expiresAt)].join(':'));
}

export interface FaceRequirement {
  valid: boolean;
  uid?: string;
  requiresFaceVerification?: boolean;
  expiresAt?: number;
}

export async function verifyFaceRequirement(signed: string | undefined): Promise<FaceRequirement> {
  if (!signed) return { valid: false };

  try {
    const payload = await verifySignature(signed);
    if (!payload) return { valid: false };

    const [uid, requires, expires] = payload.split(':');
    const expiresAt = Number(expires);
    if (!uid || Number.isNaN(expiresAt) || Date.now() > expiresAt) return { valid: false };

    return { valid: true, uid, requiresFaceVerification: requires === '1', expiresAt };
  } catch {
    return { valid: false };
  }
}

export async function signFaceVerified(uid: string, expiresAt: number): Promise<string> {
  return sign([uid, 'ok', String(expiresAt)].join(':'));
}

export interface FaceVerified {
  valid: boolean;
  uid?: string;
  expiresAt?: number;
}

export async function verifyFaceVerified(signed: string | undefined): Promise<FaceVerified> {
  if (!signed) return { valid: false };

  try {
    const payload = await verifySignature(signed);
    if (!payload) return { valid: false };

    const [uid, status, expires] = payload.split(':');
    const expiresAt = Number(expires);
    if (status !== 'ok' || !uid || Number.isNaN(expiresAt) || Date.now() > expiresAt) {
      return { valid: false };
    }

    return { valid: true, uid, expiresAt };
  } catch {
    return { valid: false };
  }
}