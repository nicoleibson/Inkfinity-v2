import 'server-only';
import type { Database } from 'firebase-admin/database';

/**
 * Server-side World ID verification.
 *
 * Trust boundary: the client proves nothing. It only forwards the IDKit result,
 * which this module validates against World ID's cloud verifier before any
 * account state changes. Nothing here trusts a client-supplied uid, nullifier,
 * or "verified" flag.
 *
 * Storage layout (see database.rules.json):
 *   worldId_nullifiers/<nullifier> = { uid, verifiedAt }   server-only index
 *   users/<uid>/worldIdVerified    = true                 admin-writable only
 *
 * The raw nullifier is a stable per-(app, action) pseudonymous identifier, so it
 * is deliberately kept out of `users`, which is publicly readable. The profile
 * only carries a boolean flag.
 */

/** v4 proof responses expose `nullifier`; session proofs expose `session_nullifier`. */
type ProofResponse = {
  identifier?: string;
  nullifier?: string;
  session_nullifier?: string[];
  success?: boolean;
};

type IdkitResult = {
  protocol_version?: string;
  action?: string;
  environment?: string;
  responses?: ProofResponse[];
};

type VerifyResponse = {
  success?: boolean;
  nullifier?: string;
  code?: string;
  detail?: string;
};

export type WorldIdVerifyResult =
  | { ok: true; nullifier: string }
  | { ok: false; status: number; error: string; unavailable?: boolean };

/** The Developer Portal scopes a nullifier to (rp, action), so this is a namespace. */
export const WORLD_ID_ACTION = 'inkfinity-account';

const VERIFY_ENDPOINT = 'https://developer.world.org/api/v4/verify';
const REQUEST_TIMEOUT_MS = 20_000;

export function getWorldIdRpId(): string | null {
  const rpId = process.env.WORLD_ID_RP_ID || process.env.WORLD_RP_ID || '';
  return rpId.startsWith('rp_') ? rpId : null;
}

/**
 * The RP signing key is server-only and never exposed to the browser. If it is
 * missing we must not fall back to unsigned requests, so callers surface
 * WORLDID_UNAVAILABLE rather than letting an unverified flow proceed.
 */
export function getWorldIdSigningKey(): string | null {
  let key = (process.env.RP_SIGNING_KEY || '').trim();
  // Quitar comillas si fueron agregadas accidentalmente en el panel de entorno
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  // Una clave privada hexadecimal de 32 bytes tiene 64 caracteres hex (o 66 con prefijo 0x)
  return /^0x?[0-9a-fA-F]{64}$/.test(key) ? key : null;
}

export function isWorldIdConfigured(): boolean {
  return getWorldIdRpId() !== null && getWorldIdSigningKey() !== null;
}

/**
 * Which World ID environment this deployment accepts.
 *
 * `staging` engages the simulator, which issues proofs that do NOT represent a
 * real human. That is fine for local testing and dangerous in production, so the
 * server — not the browser — is the authority: it tells the client which
 * environment to use and then rejects any proof whose environment disagrees.
 * Defaulting to `production` means an unset variable fails safe.
 */
export function getWorldIdEnvironment(): 'production' | 'staging' {
  const value = (process.env.WORLD_ID_ENVIRONMENT || process.env.NEXT_PUBLIC_WORLD_ID_ENVIRONMENT || '').trim();
  return value === 'staging' ? 'staging' : 'production';
}

/**
 * Normalizes a nullifier to a canonical, comparable form.
 *
 * The docs warn that casing/parsing differences around 256-bit nullifiers are a
 * real source of security bugs: the same human could otherwise be stored twice
 * under `0xAbC…` and `0xabc…` and bypass the one-account rule. Firebase keys
 * cannot contain `. # $ [ ] /`, so lowercase `0x` hex is safe as a key.
 */
export function normalizeNullifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hex)) return null;
  return hex;
}

/**
 * Verifies an IDKit result against World ID's cloud verifier and returns the
 * nullifier for a successful uniqueness proof.
 *
 * The IDKit payload is forwarded verbatim: World ID explicitly rejects remapped
 * payloads and legacy `verification_level` reconstruction. Failures that mean
 * "we could not check" (network, timeout, 404 app-not-found, 5xx, quota) map to
 * 503 WORLDID_UNAVAILABLE so the caller fails closed instead of treating an
 * outage as a rejection.
 */
export async function verifyWorldIdProof(idkitResponse: IdkitResult, db: Database): Promise<WorldIdVerifyResult> {
  const rpId = getWorldIdRpId();
  if (!rpId) {
    return {
      ok: false,
      status: 503,
      error: 'WORLDID_UNAVAILABLE',
      unavailable: true,
    };
  }

  if (!idkitResponse || typeof idkitResponse !== 'object' || !Array.isArray(idkitResponse.responses)) {
    return { ok: false, status: 400, error: 'Malformed IDKit result.' };
  }

  // Prevenir Replay Attacks: Hashear la prueba completa para asegurar que no se haya enviado antes.
  const { createHash } = await import('crypto');
  const proofHash = createHash('sha256').update(JSON.stringify(idkitResponse)).digest('hex');
  const usedProofRef = db.ref(`worldId_used_proofs/${proofHash}`);
  
  // Usamos una transacción para prevenir que dos llamadas simultáneas usen la misma prueba.
  let isReplay = false;
  await usedProofRef.transaction((current) => {
    if (current) {
      isReplay = true;
      return undefined; // Abort
    }
    return Date.now();
  });

  if (isReplay) {
    return {
      ok: false,
      status: 400,
      error: 'Replay attack detected: This proof has already been used.',
    };
  }

  // Reject simulator proofs on a production deployment (and vice versa) before
  // spending a verifier call. The cloud verifier is still the final authority.
  const expectedEnvironment = getWorldIdEnvironment();
  const claimedEnvironment = typeof idkitResponse.environment === 'string' ? idkitResponse.environment : null;
  if (claimedEnvironment && claimedEnvironment !== expectedEnvironment) {
    await usedProofRef.remove(); // Revert on early fail
    return {
      ok: false,
      status: 400,
      error: `WORLDID_ENVIRONMENT_MISMATCH (proof: ${claimedEnvironment}, server: ${expectedEnvironment})`,
    };
  }

  let response: Response;
  try {
    response = await fetch(`${VERIFY_ENDPOINT}/${encodeURIComponent(rpId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(idkitResponse),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    await usedProofRef.remove();
    return { ok: false, status: 503, error: 'WORLDID_UNAVAILABLE', unavailable: true };
  }

  let payload: VerifyResponse | null = null;
  try {
    payload = (await response.json()) as VerifyResponse;
  } catch {
    payload = null;
  }

  // "Could not verify" must never be reported as a definitive rejection.
  if (response.status >= 500 || response.status === 404 || response.status === 429) {
    await usedProofRef.remove();
    return { ok: false, status: 503, error: 'WORLDID_UNAVAILABLE', unavailable: true };
  }

  if (!response.ok || !payload?.success) {
    await usedProofRef.remove();
    return {
      ok: false,
      status: 400,
      error: payload?.detail || payload?.code || 'World ID verification failed.',
    };
  }

  // Prefer the top-level nullifier, then the uniqueness response entry. Session
  // proofs only expose `session_nullifier` tuples, which are not stable
  // per-human identifiers, so they are intentionally not accepted here.
  const responses = idkitResponse.responses || [];
  const candidate =
    payload.nullifier ??
    responses.find((item) => normalizeNullifier(item.nullifier))?.nullifier;

  const nullifier = normalizeNullifier(candidate);
  if (!nullifier) {
    await usedProofRef.remove();
    return { ok: false, status: 400, error: 'World ID proof did not include a uniqueness nullifier.' };
  }

  return { ok: true, nullifier };
}

export type LinkResult =
  | { ok: true; created: boolean }
  | { ok: false; status: number; error: string };

/**
 * Claims a nullifier for one account, atomically.
 *
 * A plain set() is not enough: two concurrent requests could both observe "free"
 * and link the same World ID to two different accounts. The transaction makes
 * read-check-write a single atomic operation, so exactly one caller wins.
 *
 * The follow-up flag write on the profile is a separate write, mirroring
 * `claimPaymentOnce`: re-verifying the same user with the same nullifier is a
 * no-op that repairs an interrupted first attempt, which is what keeps the two
 * paths from diverging permanently.
 */
export async function linkWorldIdToUser(db: Database, uid: string, nullifier: string): Promise<LinkResult> {
  const claimRef = db.ref(`worldId_nullifiers/${nullifier}`);

  try {
    const result = await claimRef.transaction((current) => {
      const existing = current as { uid?: string } | null;
      if (existing?.uid && existing.uid !== uid) {
        // Abort: returning undefined leaves the existing claim untouched.
        return undefined;
      }
      if (existing?.uid === uid) {
        // Same account re-verifying: keep the original timestamp, still idempotent.
        return existing;
      }
      return { uid, verifiedAt: new Date().toISOString() };
    });

    if (!result.committed) {
      return {
        ok: false,
        status: 409,
        error: 'This World ID is already linked to another account.',
      };
    }
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Failed to record the World ID claim.',
    };
  }

  // Safe to re-run: converges the profile flag with the claim above.
  try {
    await db.ref(`users/${uid}`).update({
      worldIdVerified: true,
      worldIdVerifiedAt: new Date().toISOString(),
    });
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Failed to update the user profile.',
    };
  }

  return { ok: true, created: true };
}