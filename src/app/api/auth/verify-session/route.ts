import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Avoid Vercel's 10s function-timeout 504 on Firebase Admin cold starts.
export const maxDuration = 60;

// Per-step timing + timeout to pinpoint production 504s (same approach as the
// session route): an indefinite hang becomes a fast, labelled error.
const STEP_TIMEOUT_MS = 15000;

async function withTimeout<T>(label: string, promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`step timeout: ${label}`)), STEP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * A rejected token is the only thing that means "this session is invalid".
 * Firebase Admin auth errors carry an `auth/` code; anything else (Admin SDK not
 * configured, credential fetch failing, network) is an outage and must not be
 * reported as 401, because the middleware treats 401 as "log this member out".
 */
function isTokenRejection(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.startsWith('auth/');
}

export async function GET(request: NextRequest): Promise<Response> {
  const t0 = Date.now();
  const lap = (label: string) => console.log(`[verify-session] ${label}: +${Date.now() - t0}ms`);
  console.log('[verify-session] env', {
    hasClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
    hasPrivateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY),
  });
  // FIX 3: Leer la sesión del header Authorization (Bearer token) en vez del
  // query param para evitar que el JWT quede expuesto en logs de servidor/CDN.
  const authHeader = request.headers.get('Authorization');
  const sessionCookie =
    authHeader?.startsWith('Bearer ') ? authHeader.slice(7) :
    // Fallback al query param por compatibilidad durante la transición
    request.nextUrl.searchParams.get('session');

  if (!sessionCookie) {
    return NextResponse.json({ error: 'No session cookie' }, { status: 400 });
  }

  let decodedClaims: { uid: string; faceVerified?: boolean; faceVerifiedAt?: number };
  try {
    const adminAuth = getAdminAuth();
    decodedClaims = await withTimeout('verifySessionCookie', adminAuth.verifySessionCookie(sessionCookie, true));
    lap('verifySessionCookie done');
  } catch (error) {
    if (isTokenRejection(error)) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
    console.error(`[verify-session] token verification unavailable after ${Date.now() - t0}ms:`, error);
    return NextResponse.json({ error: 'Session verification unavailable' }, { status: 503 });
  }

  const uid = decodedClaims.uid;

  try {
    const adminDb = getAdminDb();
    const snapshot = await withTimeout('profile get', adminDb.ref(`users/${uid}`).get());
    lap('profile get done');

    if (!snapshot.exists()) {
      return NextResponse.json({ uid, profile: null });
    }

    return NextResponse.json({
      uid,
      profile: snapshot.val(),
      faceVerified: decodedClaims.faceVerified === true,
      faceVerifiedAt: decodedClaims.faceVerifiedAt,
    });
  } catch (error) {
    // The session itself is fine; the profile lookup failed. Report a degraded
    // success so the member stays signed in.
    console.error('[verify-session] profile lookup failed:', error);
    return NextResponse.json({ uid, profile: null, degraded: true }, { status: 503 });
  }
}