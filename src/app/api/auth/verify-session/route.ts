import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const sessionCookie = request.nextUrl.searchParams.get('session');
  if (!sessionCookie) {
    return NextResponse.json({ error: 'No session cookie' }, { status: 400 });
  }

  let decodedClaims: { uid: string; faceVerified?: boolean; faceVerifiedAt?: number };
  try {
    const adminAuth = getAdminAuth();
    decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
  } catch (error) {
    if (isTokenRejection(error)) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
    console.error('[verify-session] token verification unavailable:', error);
    return NextResponse.json({ error: 'Session verification unavailable' }, { status: 503 });
  }

  const uid = decodedClaims.uid;

  try {
    const adminDb = getAdminDb();
    const snapshot = await adminDb.ref(`users/${uid}`).get();

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