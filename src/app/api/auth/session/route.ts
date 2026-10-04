import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/firebase-admin';
import { getAuth } from 'firebase-admin/auth';

export const runtime = 'nodejs';

function getAdminAuth() {
  const adminApp = getAdminApp();
  return getAuth(adminApp);
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();
    const { idToken } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'No ID token provided' }, { status: 400 });
    }

    const adminAuth = getAuth(getAdminApp());

    // Verify the ID token
    const decodedClaims = await getAuth().verifyIdToken(idToken);
    if (!decodedClaims) {
      return NextResponse.json({ error: 'Invalid ID token' }, { status: 401 });
    }

    // Create session cookie (expires in 14 days)
    const expiresIn = 60 * 60 * 24 * 14 * 1000; // 14 days in ms
    const sessionCookie = await getAuth().createSessionCookie(idToken, { expiresIn });

    // Set cookie
    const response = NextResponse.json({ success: true });
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