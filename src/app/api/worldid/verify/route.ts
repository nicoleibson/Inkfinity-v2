import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from 'firebase-admin/database';
import { getAdminApp } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/server/auth';
import { linkWorldIdToUser, verifyWorldIdProof } from '@/lib/server/worldid';

export const runtime = 'nodejs';

/**
 * Verifies a World ID proof and links it to the authenticated account.
 *
 * The uid is taken exclusively from the Firebase session token, never from the
 * request body, so one user cannot attach their proof to somebody else's account.
 * The nullifier comes only from the cloud verifier response, and is claimed
 * atomically so a single World ID can only ever be linked to a single account.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const auth = await requireAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let idkitResponse: unknown;
  try {
    const body = (await request.json()) as { idkitResponse?: unknown };
    idkitResponse = body.idkitResponse;
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  const verification = await verifyWorldIdProof(
    idkitResponse as Parameters<typeof verifyWorldIdProof>[0],
  );

  if (!verification.ok) {
    return NextResponse.json(
      { error: verification.unavailable ? 'WORLDID_UNAVAILABLE' : 'WORLDID_REJECTED', detail: verification.error },
      { status: verification.status },
    );
  }

  const link = await linkWorldIdToUser(getDatabase(getAdminApp()), auth.user.uid, verification.nullifier);
  if (!link.ok) {
    return NextResponse.json({ error: link.error }, { status: link.status });
  }

  return NextResponse.json({ success: true, linked: true });
}