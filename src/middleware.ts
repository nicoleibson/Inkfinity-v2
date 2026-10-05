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
    verifyUrl.searchParams.set('session', sessionCookie);
    
    const response = await fetch(verifyUrl.toString(), {
      headers: { 'Content-Type': 'application/json' },
      // Timeout de 5s para evitar bloqueos
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      // Si la sesión es inválida/expirada (401/403), redirigir a login
      if (response.status === 401 || response.status === 403) {
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('__session');
        return response;
      }
      // Otros errores (5xx, network) -> fail-open para no bloquear usuarios legítimos
      console.warn('Session verification failed (system error):', response.status);
      return NextResponse.next();
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
    // Solo redirigir a login en errores de autenticación claros
    // En errores de sistema (red, config, timeout) -> fail-open
    console.warn('Middleware session verification error:', error);
    
    // Si el error indica sesión inválida, redirigir a login
    if (error instanceof Error && (
      error.message.includes('session') || 
      error.message.includes('auth') ||
      error.message.includes('token') ||
      error.message.includes('unauthorized') ||
      error.message.includes('expired')
    )) {
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('__session');
      return response;
    }
    
    // Errores de sistema (red, config, timeout) -> fail-open
    console.warn('Middleware system error, failing open:', error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\.png$|.*\.jpg$|.*\.svg$|.*\.ico$|.*\.css$|.*\.js$).*)',
  ],
};
