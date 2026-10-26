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
    const rawRp = process.env.WORLD_ID_RP_ID || process.env.WORLD_RP_ID || '';
    const rawKey = process.env.RP_SIGNING_KEY || '';
    console.error('[rp-context] Missing configuration:', {
      hasRpId: Boolean(rpId),
      rawRpIdLength: rawRp.length,
      hasSigningKey: Boolean(signingKey),
      rawKeyLength: rawKey.length,
    });
    return NextResponse.json(
      {
        error: 'WORLDID_UNAVAILABLE',
        detail: !rpId
          ? `Missing or invalid WORLD_RP_ID (received length: ${rawRp.length})`
          : `Missing or invalid RP_SIGNING_KEY (received length: ${rawKey.length}, expected 64 or 66 chars with 0x)`,
      },
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
  } catch (err: any) {
    console.error('[rp-context] signRequest error:', err);
    return NextResponse.json(
      { error: 'WORLDID_UNAVAILABLE', detail: `Could not sign the World ID request: ${err?.message || err}` },
      { status: 503 },
    );
  }
}