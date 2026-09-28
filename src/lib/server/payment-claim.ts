import type { Database } from 'firebase-admin/database';

/**
 * Atomic, crash-safe consumption of a payment reference.
 *
 * A payment claim is what stops one on-chain transfer from being redeemed twice
 * (membership years, referral commissions, booking deposits). Writing it with a
 * plain `set()` is not enough: two concurrent requests can both read "no claim",
 * both verify, and both credit. A Realtime Database transaction makes the
 * read-check-write a single atomic operation, so exactly one caller wins.
 *
 * The follow-up credit is a separate write, so `claimPaymentOnce` deliberately
 * reports `created: false` when a claim already exists: callers then inspect the
 * existing claim to distinguish a genuine duplicate from a retry that has to
 * finish an interrupted settlement.
 */

export type PaymentClaim = {
  userId: string;
  kind: string;
  network: string;
  paymentRef: string;
  userOpHash?: string | null;
  verification?: string;
  bookingId?: string;
  claimedAt: string;
};

export type ClaimResult =
  | { ok: true; created: boolean; existing: Record<string, unknown> | null }
  | { ok: false; error: string };

/** Payment references come from client input; keep them to a safe path charset. */
export function sanitizeClaimKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9:-]/g, '').slice(0, 300);
}

export async function claimPaymentOnce(
  db: Database,
  key: string,
  record: PaymentClaim,
): Promise<ClaimResult> {
  const claimRef = db.ref(`payment_claims/${sanitizeClaimKey(key)}`);

  try {
    const result = await claimRef.transaction((current) => {
      // Returning undefined aborts the transaction, so a second concurrent
      // request can never overwrite or reuse an existing claim.
      if (current) return undefined;
      return record;
    });

    if (result.committed) {
      return { ok: true, created: true, existing: null };
    }

    return { ok: true, created: false, existing: result.snapshot.val() || {} };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to record the payment claim.',
    };
  }
}
