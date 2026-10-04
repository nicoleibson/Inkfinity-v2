import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

/**
 * This route must be called ONLY from the client after a successful face verification.
 * The client must be authenticated (valid __session cookie).
 */
export async function POST(request: NextRequest): Promise<Response> {
  const sessionCookie = request.cookies.get('__session')?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const adminAuth = getAdminAuth();
    const decodedClaims = await adminAuth.verifySessionCookie(request.cookies.get('__session')?.value || '', true);
    const uid = decodedClaims.uid;

    // Set face verification custom claim
    await adminAuth.setCustomUserClaims(uid, {
      faceVerified: true,
      faceVerifiedAt: Date.now(),
    });

    // Force refresh on client
    return NextResponse.json({ success: true, message: 'Face verification recorded' });
  } catch (error) {
    console.error('Error setting faceVerified claim:', error);
    return NextResponse.json(
      { error: 'Failed to record face verification' },
      { status: 500 }
    );
  }
}