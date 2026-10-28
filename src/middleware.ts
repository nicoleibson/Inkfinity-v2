import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

// Segments that belong to private/authenticated sections
const PRIVATE_SEGMENTS = [
  'admin',
];

function isPublicPath(pathname: string): boolean {
  // Root
  if (pathname === '/') return true;

  // Static assets by extension
  if (STATIC_EXTENSIONS.some(ext => pathname.endsWith(ext))) return true;

  // Explicit public path prefixes
  if (PUBLIC_PATHS.some(p => p !== '/' && (pathname === p || pathname.startsWith(p + '/')))) {
    return true;
  }

  // Any top-level single-segment path not explicitly private is treated as a
  // public dynamic profile page (e.g. /john, /studio-xyz).
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length >= 1 && !PRIVATE_SEGMENTS.includes(segments[0])) {
    return true;
  }

  return false;
}

function redirectToLogin(request: NextRequest): NextResponse {
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete('__session');
  return response;
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
