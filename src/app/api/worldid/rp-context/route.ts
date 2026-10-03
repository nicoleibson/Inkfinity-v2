import { NextRequest, NextResponse } from 'next/server';
import { signRequest } from '@worldcoin/idkit-core/signing';
import { requireAuth } from '@/lib/server/auth';
import { WORLD_ID_ACTION, getWorldIdRpId, getWorldIdSigningKey } from '@/lib/server/worldid';

export const runtime = 'nodejs';

/**
 * Issues the RP signature that World ID 4.0 requires on every proof request.
 *
 * The signature proves the request originated from this backend, which is what
 * stops someone from replaying a proof minted for another app. It is created
 * here, server-side, because the signing key must never reach the browser.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const auth = await requireAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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
      action: WORLD_ID_ACTION,
    });

    return NextResponse.json({
      rp_id: rpId,
      nonce,
      created_at: createdAt,
      expires_at: expiresAt,
      signature: sig,
    });
  } catch {
    return NextResponse.json(
      { error: 'WORLDID_UNAVAILABLE', detail: 'Could not sign the World ID request.' },
      { status: 503 },
    );
  }
}