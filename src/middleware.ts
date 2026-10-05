import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return true;
  if (STATIC_EXTENSIONS.some(ext => pathname.endsWith(ext))) return true;
  return false;
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
    // Llamar a API interna para verificar sesión y obtener perfil
    const verifyUrl = new URL('/api/auth/verify-session', request.url);
    verifyUrl.searchParams.set('session', request.cookies.get('__session')?.value || '');
    
    const response = await fetch(verifyUrl.toString(), {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error('Session verification failed');
    }

    const { uid, profile, faceVerified, faceVerifiedAt } = await response.json();

    if (!profile) {
      return NextResponse.next();
    }

    const needsFaceVerification = profile.twoFactorEnabled === true && profile.facialScanUrl;
    // Check both custom claim (from session cookie) and dedicated cookie
    const faceVerifiedCookie = request.cookies.get('face_verified')?.value === 'true';
    const faceVerifiedFlag = faceVerified === true || faceVerifiedCookie;
    const maxAge = 60 * 60 * 1000; // 1 hora

    if (needsFaceVerification && !faceVerifiedFlag) {
      const verifyFaceUrl = new URL('/verify-face', request.url);
      verifyFaceUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(verifyFaceUrl);
    }

    if (faceVerifiedFlag && typeof faceVerifiedAt === 'number') {
      if (Date.now() - faceVerifiedAt > 60 * 60 * 1000) {
        const verifyFaceUrl = new URL('/verify-face', request.url);
        verifyFaceUrl.searchParams.set('redirect', pathname);
        verifyFaceUrl.searchParams.set('expired', 'true');
        return NextResponse.redirect(verifyFaceUrl);
      }
    }

    return NextResponse.next();
  } catch (error) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('__session');
    return response;
  }
}

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\.png$|.*\.jpg$|.*\.svg$|.*\.ico$|.*\.css$|.*\.js$).*)',
  ],
};
