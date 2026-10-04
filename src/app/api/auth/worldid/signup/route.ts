import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from 'firebase-admin/database';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { verifyWorldIdProof, linkWorldIdToUser, normalizeNullifier } from '@/lib/server/worldid';

export const runtime = 'nodejs';

/**
 * Creates a new account using a World ID proof.
 * The client sends an IDKit result (unauthenticated). We verify it,
 * ensure the nullifier isn't already linked, create the Firebase Auth user
 * (no password, email optional), write the initial profile, link the nullifier,
 * and return a custom token for immediate sign-in.
 */
export async function POST(request: NextRequest): Promise<Response> {
  let idkitResponse: unknown;
  let email: string | null = null;
  let role = 'Client';
  let firstName = '';
  let lastName = '';
  let stylePreferences = '';

  try {
    const body = (await request.json()) as { idkitResponse?: unknown; email?: string; role?: string; firstName?: string; lastName?: string; stylePreferences?: string };
    idkitResponse = body.idkitResponse;
    // Optional profile fields for initial profile creation
    email = body.email?.trim().toLowerCase() || null;
    role = body.role?.trim() || 'Client';
    firstName = body.firstName?.trim() || '';
    lastName = body.lastName?.trim() || '';
    stylePreferences = body.stylePreferences?.trim() || '';

    if (!idkitResponse) {
      return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
    }
    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'First name and last name are required.' }, { status: 400 });
    }
    if (!['Client', 'Tattoo Artist', 'Studio', 'Supply Store'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  // Verify the World ID proof
  const verification = await verifyWorldIdProof(idkitResponse as Parameters<typeof verifyWorldIdProof>[0]);
  if (!verification.ok) {
    return NextResponse.json(
      { error: verification.unavailable ? 'WORLDID_UNAVAILABLE' : 'WORLDID_REJECTED', detail: verification.error },
      { status: verification.status },
    );
  }

  const nullifier = normalizeNullifier(verification.nullifier)!;
  const db = getAdminDb();
  const adminAuth = getAdminAuth();

  // Check if nullifier already linked (should not happen for signup, but race condition)
  const existingLink = await db.ref(`worldId_nullifiers/${nullifier}`).get();
  if (existingLink.exists()) {
    return NextResponse.json(
      { error: 'This World ID is already linked to an account. Please sign in instead.' },
      { status: 409 },
    );
  }

  try {
    // Create Firebase Auth user (no password, email optional)
    const userRecord = await adminAuth.createUser({
      email: email || undefined,
      emailVerified: !!email, // If email provided, treat as verified (World ID proves humanity)
      displayName: null, // Will be set after profile creation
      disabled: false,
    });

    const uid = userRecord.uid;

    // Create initial profile in RTDB
    const { add } = await import('date-fns');
    const usernameBase = `${firstName.toLowerCase()}${lastName.toLowerCase()}`.replace(/[^a-z0-9]/g, '');
    let username = usernameBase;
    const usernameRef = db.ref(`usernames/${usernameBase}`);
    const usernameSnapshot = await usernameRef.get();
    if (usernameSnapshot.exists()) {
      username = `${usernameBase}${Math.floor(Math.random() * 1000)}`;
    }

    let status: 'pending_payment' | 'active' = 'active';
    if (role === 'Studio' || role === 'Supply Store') {
      status = 'pending_payment';
    }

    let trialEndsAt: string | null = null;
    if (role === 'Tattoo Artist') {
      trialEndsAt = add(new Date(), { months: 3 }).toISOString();
    }

    const userData = {
      name: `${firstName} ${lastName}`,
      username: username,
      email: email || '',
      role: role,
      status: status,
      bio: '',
      avatarUrl: 'https://placehold.co/200x200.png',
      backgroundUrl: '',
      walletAddress: '',
      onboardingComplete: false,
      creationTime: new Date().toISOString(),
      points: 0,
      followersCount: 0,
      followingCount: 0,
      artworksCount: 0,
      collectionCount: 0,
      twoFactorEnabled: false,
      storageUsed: 0,
      trialEndsAt: trialEndsAt,
      artistRequestStatus: 'none',
      referralCodeUsed: false,
      legal: {
        globalTerms: true,
        acceptedAt: new Date().toISOString(),
      },
      authProviders: ['worldid'], // Track auth methods
    };

    // Atomic multi-path write: user profile + username map + worldId_nullifiers link
    const updates: { [key: string]: any } = {};
    updates[`/users/${uid}`] = userData;
    updates[`/usernames/${username}`] = uid;
    updates[`/worldId_nullifiers/${nullifier}`] = { uid, verifiedAt: new Date().toISOString() };

    await db.ref('/').update(updates);

    // Issue custom token for immediate sign-in
    const customToken = await adminAuth.createCustomToken(uid, { worldIdVerified: true, provider: 'worldid' });

    return NextResponse.json({ success: true, customToken, uid });
  } catch (error) {
    console.error('World ID signup error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create account with World ID.' },
      { status: 500 },
    );
  }
}