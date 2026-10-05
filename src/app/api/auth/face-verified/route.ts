import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { signFaceVerified } from '@/lib/crypto/hmac';
import { hasActiveMembership } from '@/lib/utils/membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FACE_CONFIDENCE_THRESHOLD = 0.8;

function isDataUri(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

/**
 * Grants the facial-verification grant after re-checking the match on the server.
 *
 * The client cannot be trusted to report its own verdict: it only submits the live
 * frames, while the registered scan is read from the database and the comparison is
 * re-run here. The signed cookie is issued only on a real match, so calling this
 * endpoint directly cannot bypass the facial check.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const sessionCookie = request.cookies.get('__session')?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const frame1 = body.frame1;
  const frame2 = body.frame2;
  const frame3 = body.frame3;

  if (!isDataUri(frame1) || !isDataUri(frame2) || !isDataUri(frame3)) {
    return NextResponse.json({ error: 'Three live frames are required.' }, { status: 400 });
  }

  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
  const uid = decodedClaims.uid;

  const snapshot = await adminDb.ref(`users/${uid}`).get();
  if (!snapshot.exists()) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }

  const profile = snapshot.val();

  if (profile.twoFactorEnabled !== true || !profile.facialScanUrl) {
    return NextResponse.json({ error: 'Facial verification is not enabled.' }, { status: 403 });
  }

  if (!hasActiveMembership(profile)) {
    return NextResponse.json({ error: 'An active membership is required.' }, { status: 403 });
  }

  let verdict: { isMatch?: boolean; confidence?: number; reason?: string };
  try {
    const { verifyFace } = await import('@/ai/flows/verify-face-flow');
    verdict = await verifyFace({
      registeredImageUrl: profile.facialScanUrl,
      liveCaptureDataUri: frame1,
      liveCaptureFrame2: frame2,
      liveCaptureFrame3: frame3,
    });
  } catch (error) {
    console.error('Server-side face verification failed:', error);
    return NextResponse.json({ error: 'Verification could not be completed.' }, { status: 502 });
  }

  const confidence = typeof verdict.confidence === 'number' ? verdict.confidence : 0;
  const accepted = verdict.isMatch === true && confidence >= FACE_CONFIDENCE_THRESHOLD;

  if (!accepted) {
    return NextResponse.json(
      {
        success: false,
        isMatch: false,
        confidence,
        reason: verdict.reason ?? 'Identity could not be confirmed.',
      },
      { status: 401 },
    );
  }

  const verifiedAt = Date.now();

  await adminAuth.setCustomUserClaims(uid, {
    faceVerified: true,
    faceVerifiedAt: verifiedAt,
  });

  const response = NextResponse.json({
    success: true,
    confidence,
    reason: verdict.reason ?? 'Identity confirmed.',
  });

  // httpOnly so the grant cannot be forged or extended from the browser.
  response.cookies.set('face_verified_signed', await signFaceVerified(uid, verifiedAt + 60 * 60 * 1000), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60,
  });

  return response;
}