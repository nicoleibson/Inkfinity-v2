import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const sessionCookie = request.nextUrl.searchParams.get('session');
  if (!sessionCookie) {
    return NextResponse.json({ error: 'No session cookie' }, { status: 400 });
  }

  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
    const uid = decodedClaims.uid;

    const userRef = adminDb.ref(`users/${uid}`);
    const snapshot = await userRef.get();

    if (!snapshot.exists()) {
      return NextResponse.json({ uid, profile: null });
    }

    const profile = snapshot.val();

    return NextResponse.json({
      uid,
      profile,
      faceVerified: decodedClaims.faceVerified === true,
      faceVerifiedAt: decodedClaims.faceVerifiedAt,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
}