import 'server-only';
import type { NextRequest } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '@/lib/firebase-admin';

export type AuthedUser = { uid: string; email: string | null };

export type AuthResult = { ok: true; user: AuthedUser } | { ok: false; status: number; error: string };

function extractBearer(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Verifies the Firebase ID token sent by the client as `Authorization: Bearer <token>`.
 *
 * Every server-side route that uses the Admin SDK MUST gate on this: the Admin SDK
 * bypasses Realtime Database rules entirely, so `auth != null` checks in
 * database.rules.json do not apply and an unauthenticated caller could otherwise
 * write to (or read from) any user path.
 */
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  const token = extractBearer(request.headers.get('authorization'));
  if (!token) {
    return { ok: false, status: 401, error: 'Missing Authorization bearer token.' };
  }

  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
    return { ok: true, user: { uid: decoded.uid, email: decoded.email ?? null } };
  } catch {
    return { ok: false, status: 401, error: 'Invalid or expired session token.' };
  }
}
