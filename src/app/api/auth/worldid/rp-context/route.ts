import { NextRequest, NextResponse } from 'next/server';
import { signRequest } from '@worldcoin/idkit-core/signing';
import { WORLD_ID_ACTION, getWorldIdRpId, getWorldIdSigningKey, getWorldIdEnvironment } from '@/lib/server/worldid';

export const runtime = 'nodejs';
// Firebase Admin / Cloud Storage round-trips can exceed Vercel's default 10s
// function limit, which surfaces as a 504 Gateway Timeout.
export const maxDuration = 60;


/**
 * Public RP context endpoint for World ID authentication flows (login/signup).
 * Does NOT require authentication - used by unauthenticated clients to get
 * the RP signature needed for IDKit. The server still validates configuration.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const rpId = getWorldIdRpId();
  const signingKey = getWorldIdSigningKey();

  if (!rpId || !signingKey) {
    return NextResponse.json(
      { error: 'WORLDID_UNAVAILABLE', detail: 'World ID is not configured on this server.' },
      { status: 503 },
    );
  }

  try {
    const { sig, nonce, createdAt, expiresAt } = signRequest({
      signingKeyHex: signingKey,
      action: 'inkfinity-auth', // Different action for auth vs verification
    });

    return NextResponse.json({
      rp_id: rpId,
      nonce,
      created_at: createdAt,
      expires_at: expiresAt,
      signature: sig,
      environment: getWorldIdEnvironment(),
    });
  } catch {
    return NextResponse.json(
      { error: 'WORLDID_UNAVAILABLE', detail: 'Could not sign the World ID request.' },
      { status: 503 },
    );
  }
}