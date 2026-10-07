import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyFaceRequirement, verifyFaceVerified } from '@/lib/crypto/hmac';
import { hasActiveMembership } from '@/lib/utils/membership';

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/verify-face',
  '/verify-face/email-link',
  '/api/auth',
  '/api/worldid',
  '/api/verify-payment',
  '/api/verify-booking-payment',
  '/_next',
  '/_static',
  '/favicon.ico',
  '/robots.txt',
];

const STATIC_EXTENSIONS = ['.ico', '.png', '.jpg', '.jpeg', '.svg', '.css', '.js', '.woff', '.woff2', '.ttf', '.eot'];
const FACE_GRANT_COOKIES = ['face_req_signed', 'face_verified_signed'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return true;
  if (STATIC_EXTENSIONS.some(ext => pathname.endsWith(ext))) return true;
  return false;
}

function redirectToLogin(request: NextRequest): NextResponse {
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete('__session');
  for (const name of FACE_GRANT_COOKIES) {
    response.cookies.delete(name);
  }
  return response;
}

function redirectToVerifyFace(request: NextRequest, pathname: string, expired = false): NextResponse {
  const url = new URL('/verify-face', request.url);
  url.searchParams.set('redirect', pathname);
  if (expired) url.searchParams.set('expired', 'true');
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('__session')?.value;
  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    // The facial-verification grant is carried by an HMAC-signed cookie rather than by
    // the profile, so an infrastructure failure in verify-session cannot silently drop
    // the 2FA requirement (the old fail-open path let members skip the face check).
    const faceRequirement = await verifyFaceRequirement(request.cookies.get('face_req_signed')?.value);
    const faceGrant = await verifyFaceVerified(request.cookies.get('face_verified_signed')?.value);

    if (faceRequirement.valid && faceRequirement.requiresFaceVerification) {
      // A grant is only accepted when it is signed for this same account; a grant
      // belonging to someone else must not satisfy the requirement.
      if (!faceGrant.valid || faceGrant.uid !== faceRequirement.uid) {
        return redirectToVerifyFace(request, pathname);
      }
    }

    const verifyUrl = new URL('/api/auth/verify-session', request.url);

    const response = await fetch(verifyUrl.toString(), {
      headers: {
        'Content-Type': 'application/json',
        // FIX 3: Pasar la sesión como header en vez de query param para evitar
        // que el JWT quede expuesto en logs de Vercel, CDN o proxies intermedios.
        'Authorization': `Bearer ${sessionCookie}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      // 401/403 mean the session itself is invalid or revoked.
      if (response.status === 401 || response.status === 403) {
        return redirectToLogin(request);
      }
      // Anything else is an infrastructure problem. Access is allowed, but the
      // signed requirement above has already been enforced for 2FA members.
      console.warn('[middleware] session verification unavailable:', response.status);
      return NextResponse.next();
    }

    const { uid, profile, faceVerifiedAt } = await response.json();

    if (!profile) {
      return NextResponse.next();
    }

    // Defence in depth: the signed cookie above is the fast path and holds even when
    // verify-session is unavailable, but when the profile does come back it is
    // authoritative, so a missing or stale requirement cookie cannot be used to skip 2FA.
    const profileNeedsFace =
      profile.twoFactorEnabled === true &&
      Boolean(profile.facialScanUrl) &&
      hasActiveMembership(profile);
    if (profileNeedsFace && (!faceGrant.valid || faceGrant.uid !== uid)) {
      return redirectToVerifyFace(request, pathname);
    }

    // The custom claim is the source of truth for expiry; the signed cookie only
    // carries a 1h window, so an older claim can still be rejected here.
    if (typeof faceVerifiedAt === 'number' && Date.now() - faceVerifiedAt > 60 * 60 * 1000) {
      if (faceGrant.valid && faceGrant.expiresAt !== undefined && Date.now() <= faceGrant.expiresAt) {
        return NextResponse.next();
      }
      return redirectToVerifyFace(request, pathname, true);
    }

    return NextResponse.next();
  } catch (error) {
    console.warn('[middleware] session verification error:', error);

    if (
      error instanceof Error &&
      (error.message.includes('session') ||
        error.message.includes('auth') ||
        error.message.includes('token') ||
        error.message.includes('unauthorized') ||
        error.message.includes('expired'))
    ) {
      return redirectToLogin(request);
    }

    // Infrastructure error: the signed requirement still gates 2FA members above,
    // so failing open here no longer grants an unverified session.
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\.png$|.*\.jpg$|.*\.svg$|.*\.ico$|.*\.css$|.*\.js$).*)',
  ],
};