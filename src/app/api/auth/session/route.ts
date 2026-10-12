import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { signFaceRequirement } from '@/lib/crypto/hmac';
import { hasActiveMembership } from '@/lib/utils/membership';

export const runtime = 'nodejs';
// Firebase Admin cold start + Google Auth/RTDB round-trips can exceed Vercel's
// default 10s function limit, which surfaced as a 504 Gateway Timeout. Give the
// route headroom so it is never killed mid-session-creation.
export const maxDuration = 60;

// Diagnose the production 504: every Firebase Admin call is a network
// round-trip that can stall on a cold serverless instance. Wrapping each step
// with a timeout turns an indefinite hang into a fast, labelled 500 that shows
// up in the Vercel logs, and the timing laps reveal which step is the culprit.
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

export async function POST(request: NextRequest): Promise<Response> {
  const t0 = Date.now();
  const lap = (label: string) => console.log(`[session] ${label}: +${Date.now() - t0}ms`);
  console.log('[session] env', {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
    dbUrl: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? null,
    hasClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
    hasPrivateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY),
    hasFaceSecret: Boolean(process.env.FACE_VERIFICATION_SECRET),
  });
  try {
    const body = await request.json();
    lap('body parsed');
    const { idToken } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'No ID token provided' }, { status: 400 });
    }

    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();
    lap('admin ready');

    // Verify the ID token
    const decodedClaims = await withTimeout('verifyIdToken', adminAuth.verifyIdToken(idToken));
    lap('verifyIdToken done');
    if (!decodedClaims) {
      return NextResponse.json({ error: 'Invalid ID token' }, { status: 401 });
    }

    const uid = decodedClaims.uid;

    // Get user profile
    const userRef = adminDb.ref(`users/${uid}`);
    const snapshot = await withTimeout('rtdb get', userRef.get());
    lap('rtdb get done');
    const profile = snapshot.exists() ? snapshot.val() : null;

    // Create session cookie (expires in 14 days)
    const expiresIn = 60 * 60 * 24 * 14 * 1000; // 14 days in ms
    const sessionCookie = await withTimeout(
      'createSessionCookie',
      adminAuth.createSessionCookie(idToken, { expiresIn })
    );
    lap('createSessionCookie done');

    // Set cookie
    const response = NextResponse.json({ success: true });

    // Determine if facial verification is required (only if user has 2FA enabled AND has active membership)
    const needsFaceVerification =
      profile?.twoFactorEnabled === true &&
      Boolean(profile?.facialScanUrl) &&
      hasActiveMembership(profile);
    if (needsFaceVerification) {
      // Matched to the __session lifetime. The cookie is signed and only minted here
      // from the server-read profile, so a longer life does not widen the bypass: a
      // lapsed membership keeps 2FA enforced until the session itself ends.
      const faceReqExpires = Date.now() + 60 * 60 * 24 * 14 * 1000;
      const signedFaceReq = await signFaceRequirement(uid, true, faceReqExpires);
      response.cookies.set('face_req_signed', signedFaceReq, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 14,
      });
    } else {
      // Clear face requirement if not needed
      response.cookies.set('face_req_signed', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
    }

    response.cookies.set('__session', sessionCookie, {
      maxAge: 60 * 60 * 24 * 14, // 14 days in seconds
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch (error) {
    console.error(`[session] failed after ${Date.now() - t0}ms:`, error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
