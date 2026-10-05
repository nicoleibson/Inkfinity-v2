import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { signFaceRequirement } from '@/lib/crypto/hmac';
import { hasActiveMembership } from '@/lib/utils/membership';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();
    const { idToken } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'No ID token provided' }, { status: 400 });
    }

    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    // Verify the ID token
    const decodedClaims = await adminAuth.verifyIdToken(idToken);
    if (!decodedClaims) {
      return NextResponse.json({ error: 'Invalid ID token' }, { status: 401 });
    }

    const uid = decodedClaims.uid;

    // Get user profile
    const userRef = adminDb.ref(`users/${uid}`);
    const snapshot = await userRef.get();
    const profile = snapshot.exists() ? snapshot.val() : null;

    // Create session cookie (expires in 14 days)
    const expiresIn = 60 * 60 * 24 * 14 * 1000; // 14 days in ms
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

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
    console.error('Error creating session cookie:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
