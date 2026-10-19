import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from 'firebase-admin/database';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { verifyWorldIdProof, normalizeNullifier } from '@/lib/server/worldid';

export const runtime = 'nodejs';
// Firebase Admin / Cloud Storage round-trips can exceed Vercel's default 10s
// function limit, which surfaces as a 504 Gateway Timeout.
export const maxDuration = 60;

/**
 * Signs in an existing user using a World ID proof.
 * The client sends an IDKit result (unauthenticated). We verify it,
 * look up the nullifier in the worldId_nullifiers index, and if found,
 * issue a custom token for the linked uid.
 */
export async function POST(request: NextRequest): Promise<Response> {
  let idkitResponse: unknown;
  try {
    const body = (await request.json()) as { idkitResponse?: unknown };
    idkitResponse = body.idkitResponse;
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  if (!idkitResponse) {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  const db = getAdminDb();
  const adminAuth = getAdminAuth();

  // Verify the World ID proof
  const verification = await verifyWorldIdProof(idkitResponse as Parameters<typeof verifyWorldIdProof>[0], db);
  if (!verification.ok) {
    return NextResponse.json(
      { error: verification.unavailable ? 'WORLDID_UNAVAILABLE' : 'WORLDID_REJECTED', detail: verification.error },
      { status: verification.status },
    );
  }

  const nullifier = normalizeNullifier(verification.nullifier)!;

  // Look up the nullifier in the index
  const linkSnap = await db.ref(`worldId_nullifiers/${nullifier}`).get();
  if (!linkSnap.exists()) {
    return NextResponse.json(
      { error: 'No account linked to this World ID. Please sign up first.' },
      { status: 404 },
    );
  }

  const linkData = linkSnap.val() as { uid: string };
  const uid = linkData.uid;

  // Verify the user still exists and is not disabled
  try {
    const userRecord = await adminAuth.getUser(uid);
    if (userRecord.disabled) {
      return NextResponse.json({ error: 'Account is disabled.' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Linked account not found.' }, { status: 404 });
  }

  // Issue custom token for sign-in
  const customToken = await adminAuth.createCustomToken(uid, { worldIdVerified: true, provider: 'worldid' });

  return NextResponse.json({ success: true, customToken, uid });
}