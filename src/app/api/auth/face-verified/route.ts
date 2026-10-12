import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { signFaceVerified } from '@/lib/crypto/hmac';
import { hasActiveMembership } from '@/lib/utils/membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The Genkit/Gemini comparison + Firebase Admin round-trips routinely exceed
// Vercel's default 10s function limit, which can surface as a 504.
export const maxDuration = 60;

// Diagnose production 504s: each Firebase/Gemini call is a network round-trip
// that can hang on a cold serverless instance. A per-step timeout turns an
// indefinite hang into a fast, labelled error visible in the Vercel logs.
const STEP_TIMEOUT_MS = 20000;

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

// FIX 4: Subido de 0.8 → 0.92. Un 2FA biométrico no puede aceptar
// similitudes del 80%; se requiere alta certeza.
const FACE_CONFIDENCE_THRESHOLD = 0.92;

// FIX 1: Rate-limiting desde el servidor.
// El lock del cliente (face-lock.ts) es solo UX; este es el control real.
const LOCK_STEPS = [
  { after: 3, durationMs: 30_000 },
  { after: 5, durationMs: 300_000 },
  { after: 7, durationMs: 1_800_000 },
];
const MAX_LOCK_MS = 30 * 60_000;

interface FacialAttempts {
  failed?: number;
  lockedUntil?: number | null;
}

async function checkServerLock(uid: string, db: ReturnType<typeof getAdminDb>): Promise<{ locked: boolean; retryAfterMs: number }> {
  const snap = await db.ref(`users/${uid}/facialAttempts`).get();
  const data = (snap.val() ?? {}) as FacialAttempts;
  const now = Date.now();
  const lockedUntil = typeof data.lockedUntil === 'number' ? data.lockedUntil : 0;
  if (lockedUntil > now) {
    return { locked: true, retryAfterMs: lockedUntil - now };
  }
  return { locked: false, retryAfterMs: 0 };
}

async function registerServerFailure(uid: string, db: ReturnType<typeof getAdminDb>): Promise<void> {
  try {
    await db.ref(`users/${uid}/facialAttempts`).transaction((current) => {
      const data = (current ?? {}) as FacialAttempts;
      // Si ya está bloqueado, no incrementar
      if (typeof data.lockedUntil === 'number' && data.lockedUntil > Date.now()) {
        return current;
      }
      const failed = (data.failed ?? 0) + 1;
      let lockedUntil: number | null = null;
      for (let i = LOCK_STEPS.length - 1; i >= 0; i--) {
        if (failed >= LOCK_STEPS[i].after) {
          lockedUntil = Date.now() + Math.min(MAX_LOCK_MS, LOCK_STEPS[i].durationMs);
          break;
        }
      }
      return { failed, lockedUntil };
    });
  } catch (error) {
    console.error('[face-verified] registerServerFailure error:', error);
  }
}

async function resetServerFailures(uid: string, db: ReturnType<typeof getAdminDb>): Promise<void> {
  try {
    await db.ref(`users/${uid}/facialAttempts`).update({ failed: 0, lockedUntil: null });
  } catch (error) {
    console.error('[face-verified] resetServerFailures error:', error);
  }
}

// FIX 2: Lista blanca de dominios permitidos para el scan facial registrado.
// Evita SSRF: un atacante no puede apuntar facialScanUrl a una URL interna.
const ALLOWED_SCAN_HOSTNAMES = [
  'lh3.googleusercontent.com',
  'drive.google.com',
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'placehold.co',
];

function isSafeScanUrl(url: string): boolean {
  if (!url) return false;
  // Allow data URIs (client-side stored images)
  if (url.startsWith('data:image/')) {
    // Basic validation - ensure it's base64 encoded
    return /data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(url);
  }
  try {
    const parsed = new URL(url);
    // Solo HTTPS en producción
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') return false;
    return ALLOWED_SCAN_HOSTNAMES.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

function isDataUri(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

/**
 * Grants the facial-verification grant after re-checking the match on the server.
 *
 * Security:
 * - Server-side rate limiting (cannot be bypassed calling the endpoint directly).
 * - facialScanUrl validated against an allowlist before being sent to the AI model (SSRF prevention).
 * - Confidence threshold raised to 0.92 for biometric-grade verification.
 * - Failure counter is incremented server-side on every failed attempt.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const t0 = Date.now();
  const lap = (label: string) => console.log(`[face-verified] ${label}: +${Date.now() - t0}ms`);
  console.log('[face-verified] env', {
    hasClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
    hasPrivateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY),
    hasFaceSecret: Boolean(process.env.FACE_VERIFICATION_SECRET),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY),
  });
  const sessionCookie = request.cookies.get('__session')?.value;
  if (!sessionCookie) {
    console.warn('[face-verified] no __session cookie');
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

  // Prevenir bypass con fotos estáticas duplicadas (mismo frame clonado 3 veces).
  if (frame1 === frame2 || frame2 === frame3 || frame1 === frame3) {
    return NextResponse.json(
      { error: 'Distinct live frames captured moments apart are required.' },
      { status: 400 },
    );
  }

  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  let uid: string;
  try {
    const decodedClaims = await withTimeout('verifySessionCookie', adminAuth.verifySessionCookie(sessionCookie, true));
    uid = decodedClaims.uid;
    lap('verifySessionCookie done');
  } catch (error) {
    console.error(`[face-verified] session verification failed after ${Date.now() - t0}ms:`, error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // FIX 1: Verificar el lock en el servidor ANTES de cualquier operación costosa.
  const lock = await withTimeout('checkServerLock', checkServerLock(uid, adminDb));
  lap('checkServerLock done');
  if (lock.locked) {
    const minutes = Math.ceil(lock.retryAfterMs / 60_000);
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${minutes} min.` },
      { status: 429 },
    );
  }

  const snapshot = await withTimeout('profile get', adminDb.ref(`users/${uid}`).get());
  lap('profile get done');
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

  // FIX 2: Validar el dominio de facialScanUrl antes de enviarlo al modelo AI.
  if (!isSafeScanUrl(profile.facialScanUrl)) {
    console.error(`[face-verified] Blocked unsafe facialScanUrl for uid=${uid}: ${profile.facialScanUrl}`);
    return NextResponse.json(
      { error: 'Verification could not be completed: invalid scan reference.' },
      { status: 403 },
    );
  }

  let verdict: { isMatch?: boolean; confidence?: number; reason?: string };
  try {
    lap('loading verify-face flow');
    const { verifyFace } = await import('@/ai/flows/verify-face-flow');
    lap('verify-face flow loaded');
    verdict = await withTimeout('verifyFace', verifyFace({
      registeredImageUrl: profile.facialScanUrl,
      liveCaptureDataUri: frame1,
      liveCaptureFrame2: frame2,
      liveCaptureFrame3: frame3,
    }));
    lap('verifyFace done');
  } catch (error) {
    console.error(`[face-verified] face verification failed after ${Date.now() - t0}ms:`, error);
    // No registrar como fallo del usuario si el modelo falla por error de infraestructura.
    return NextResponse.json({ error: 'Verification could not be completed.' }, { status: 502 });
  }

  const confidence = typeof verdict.confidence === 'number' ? verdict.confidence : 0;
  // FIX 4: Umbral subido a 0.92 para certeza biométrica real.
  const accepted = verdict.isMatch === true && confidence >= FACE_CONFIDENCE_THRESHOLD;

  if (!accepted) {
    // FIX 1: Registrar el fallo en el servidor, independientemente del cliente.
    await withTimeout('registerServerFailure', registerServerFailure(uid, adminDb));
    lap('registerServerFailure done');
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

  // Éxito: resetear contadores en el servidor.
  await withTimeout('resetServerFailures', resetServerFailures(uid, adminDb));
  lap('resetServerFailures done');

  const verifiedAt = Date.now();

  await withTimeout('setCustomUserClaims', adminAuth.setCustomUserClaims(uid, {
    faceVerified: true,
    faceVerifiedAt: verifiedAt,
  }));
  lap('setCustomUserClaims done');

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