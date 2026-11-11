import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminAuth } from '@/lib/firebase-admin';

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
  });
  try {
    const body = await request.json();
    lap('body parsed');
    const { idToken } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'No ID token provided' }, { status: 400 });
    }

    const adminAuth = getAdminAuth();
    lap('admin ready');

    // Force a fresh OAuth access token before anything that needs one. The
    // Admin SDK caches the in-flight token promise on the app instance; if a
    // credential/token request fails synchronously, that cache can be left
    // empty while `isRefreshing` stays true, and every later call fails with
    // the misleading "Cannot read properties of undefined (reading 'then')".
    // Requesting it here (force = true) either heals the cache or surfaces the
    // real credential error.
    const appInternals = (getAdminApp() as unknown as {
      INTERNAL?: { getToken?: (forceRefresh?: boolean) => Promise<unknown> };
    }).INTERNAL;
    if (appInternals?.getToken) {
      await withTimeout('accessToken', appInternals.getToken(true));
      lap('accessToken done');
    }

    // Verify the ID token
    const decodedClaims = await withTimeout('verifyIdToken', adminAuth.verifyIdToken(idToken));
    lap('verifyIdToken done');
    if (!decodedClaims) {
      return NextResponse.json({ error: 'Invalid ID token' }, { status: 401 });
    }

    // Create session cookie (expires in 14 days)
    const expiresIn = 60 * 60 * 24 * 14 * 1000; // 14 days in ms
    const sessionCookie = await withTimeout(
      'createSessionCookie',
      adminAuth.createSessionCookie(idToken, { expiresIn })
    );
    lap('createSessionCookie done');

    // The cookie has to be usable on whatever scheme the client is actually on.
    // Deriving it from NODE_ENV breaks `next start` over http (the browser drops
    // a Secure cookie), which used to look like an endless /login redirect.
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    const isHttps = request.nextUrl.protocol === 'https:' || forwardedProto === 'https';

    // Set cookie
    const response = NextResponse.json({ success: true });

    response.cookies.set('__session', sessionCookie, {
      maxAge: 60 * 60 * 24 * 14, // 14 days in seconds
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error(`[session] failed after ${Date.now() - t0}ms:`, error);
    const message = error?.message || 'Failed to create session';
    return NextResponse.json({ error: message, code: error?.code ?? null }, { status: 500 });
  }
}
