import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// import { verifyFaceRequirement, verifyFaceVerified } from '@/lib/crypto/hmac';
import { hasActiveMembership } from '@/lib/utils/membership';

// Public routes that do not require authentication
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/about',
  '/terms',
  '/privacy',
  '/search',
  '/artwork',
  '/dashboard',
  '/chat',
  '/collection',
  '/following',
  '/notifications',
  '/payment',
  '/rewards',
  '/settings',
  '/upload',
  '/uploads',
  '/[username]', // dynamic profile pages
  '/api/auth',
  '/api/worldid',
  '/api/verify-payment',
  '/api/verify-booking-payment',
  '/_next',
  '/_static',
  '/favicon.ico',
  '/robots.txt',
  '/manifest.webmanifest',
  '/manifest',
];

const STATIC_EXTENSIONS = ['.ico', '.png', '.jpg', '.jpeg', '.svg', '.css', '.js', '.woff', '.woff2', '.ttf', '.eot'];

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  if (STATIC_EXTENSIONS.some(ext => pathname.endsWith(ext))) return true;
  return PUBLIC_PATHS.some(p => p !== '/' && (pathname === p || pathname.startsWith(p + '/')));
}

function redirectToLogin(request: NextRequest): NextResponse {
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete('__session');
  return response;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Allow public paths without authentication
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
    const verifyUrl = new URL('/api/auth/verify-session', request.url);
    const response = await fetch(verifyUrl.toString(), {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionCookie}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return redirectToLogin(request);
      }
      console.warn('[middleware] session verification unavailable:', response.status);
      return NextResponse.next();
    }

    // Session is valid – allow request to continue
    return NextResponse.next();
  } catch (error) {
    console.warn('[middleware] session verification error:', error);
    return redirectToLogin(request);
  }
}

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$|.*\\.css$|.*\\.js$).*)',
  ],
};