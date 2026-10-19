import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { verifyWorldIdProof, normalizeNullifier } from '@/lib/server/worldid';

export const runtime = 'nodejs';
// Firebase Admin / Cloud Storage round-trips can exceed Vercel's default 10s
// function limit, which surfaces as a 504 Gateway Timeout.
export const maxDuration = 60;

/**
 * Creates a new account using a World ID proof.
 * The client sends an IDKit result (unauthenticated). We verify it,
 * ensure the nullifier isn't already linked, create the Firebase Auth user
 * (no password, email optional), write the initial profile, link the nullifier,
 * and return a custom token for immediate sign-in.
 *
 * Security fixes:
 * 1. Anti-replay: verifyWorldIdProof now records the proof hash atomically.
 * 2. emailVerified is always false - World ID proves humanity, NOT email ownership.
 * 3. Anti-race-condition: nullifier claim uses a Firebase transaction so two
 *    concurrent requests for the same World ID only one wins.
 */
export async function POST(request: NextRequest): Promise<Response> {
  let idkitResponse: unknown;
  let email: string | null = null;
  let role = 'Client';
  let firstName = '';
  let lastName = '';
  let stylePreferences = '';

  try {
    const body = (await request.json()) as {
      idkitResponse?: unknown;
      email?: string;
      role?: string;
      firstName?: string;
      lastName?: string;
      stylePreferences?: string;
    };
    idkitResponse = body.idkitResponse;
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

  const db = getAdminDb();
  const adminAuth = getAdminAuth();

  // FIX 1: Pasamos db a verifyWorldIdProof para la protección anti-replay.
  const verification = await verifyWorldIdProof(
    idkitResponse as Parameters<typeof verifyWorldIdProof>[0],
    db,
  );
  if (!verification.ok) {
    return NextResponse.json(
      { error: verification.unavailable ? 'WORLDID_UNAVAILABLE' : 'WORLDID_REJECTED', detail: verification.error },
      { status: verification.status },
    );
  }

  const nullifier = normalizeNullifier(verification.nullifier)!;

  // FIX 3: Usamos una transacción atómica sobre el nullifier para evitar race conditions.
  // Si dos peticiones llegan simultáneamente, solo una podrá crear la cuenta.
  const nullifierRef = db.ref(`worldId_nullifiers/${nullifier}`);
  let nullifierAlreadyExists = false;

  const txResult = await nullifierRef.transaction((current) => {
    if (current !== null) {
      // Nullifier ya está tomado → abortar transacción
      nullifierAlreadyExists = true;
      return undefined;
    }
    // Reservar el nullifier de forma atómica con un placeholder
    return { reservedAt: Date.now() };
  });

  if (nullifierAlreadyExists || !txResult.committed) {
    return NextResponse.json(
      { error: 'This World ID is already linked to an account. Please sign in instead.' },
      { status: 409 },
    );
  }

  let uid: string | null = null;

  try {
    // FIX 2: emailVerified es siempre false. World ID prueba que es humano, 
    // NO que el usuario es dueño del correo. El usuario deberá verificar el 
    // email por separado (Firebase Auth send verification link).
    const userRecord = await adminAuth.createUser({
      email: email || undefined,
      emailVerified: false,
      displayName: undefined,
      disabled: false,
    });

    uid = userRecord.uid;

    // Generate username with collision retry loop
    const { add } = await import('date-fns');
    const rawBase = `${firstName.toLowerCase()}${lastName.toLowerCase()}`.replace(/[^a-z0-9]/g, '');
    const usernameBase = rawBase || 'user';
    let username = usernameBase;
    let attempts = 0;
    while (attempts < 10) {
      const usernameSnapshot = await db.ref(`usernames/${username}`).get();
      if (!usernameSnapshot.exists()) {
        break;
      }
      attempts++;
      username = `${usernameBase}${Math.floor(1000 + Math.random() * 9000)}`;
    }
    if (attempts >= 10) {
      username = `${usernameBase}${Date.now().toString().slice(-6)}`;
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
      username,
      email: email || '',
      role,
      status,
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
      trialEndsAt,
      artistRequestStatus: 'none',
      referralCodeUsed: false,
      stylePreferences: stylePreferences || '',
      worldIdVerified: true,
      worldIdVerifiedAt: new Date().toISOString(),
      legal: {
        globalTerms: true,
        acceptedAt: new Date().toISOString(),
      },
      authProviders: ['worldid'],
    };

    // Atomic multi-path write: actualiza el nullifier reservado con el uid real,
    // y escribe perfil + mapa de username en un solo update.
    const updates: { [key: string]: unknown } = {};
    updates[`/users/${uid}`] = userData;
    updates[`/usernames/${username}`] = uid;
    updates[`/worldId_nullifiers/${nullifier}`] = { uid, verifiedAt: new Date().toISOString() };

    await db.ref('/').update(updates);

    // Issue custom token for immediate sign-in
    const customToken = await adminAuth.createCustomToken(uid, { worldIdVerified: true, provider: 'worldid' });

    return NextResponse.json({ success: true, customToken, uid });
  } catch (error) {
    console.error('World ID signup error:', error);

    // Rollback: Si falló después de reservar el nullifier, limpiarlo para que el 
    // usuario pueda intentarlo de nuevo.
    try {
      await nullifierRef.remove();
      if (uid) {
        await adminAuth.deleteUser(uid);
      }
    } catch (rollbackError) {
      console.error('World ID signup rollback error:', rollbackError);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create account with World ID.' },
      { status: 500 },
    );
  }
}