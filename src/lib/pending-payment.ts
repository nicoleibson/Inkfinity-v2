/**
 * Pending payments that outlive the page that created them.
 *
 * The client polls the verification endpoint for two minutes and then gives up
 * with `TX_PENDING`. At that point the money has left the wallet but nothing is
 * credited yet, and the payment reference only existed in component state — so a
 * reload (or navigating away) threw away the only handle needed to retry without
 * paying twice. Persisting the reference gives the user a real "verify again"
 * path: re-running verification with the same hash is safe because the server
 * consumes the payment claim atomically and finishes an interrupted settlement
 * instead of double-crediting.
 */

export type PendingPayment = {
  txHash: string | null;
  userOpHash: string | null;
  network: string;
  bookingId?: string;
  intent?: 'deposit' | 'refund';
  savedAt?: number;
};

const STORAGE_PREFIX = 'inkfinity:pending-payment:';

/**
 * How long a stored reference stays offerable as a "check again" action.
 *
 * A transfer that has not been confirmed after a week is never going to be
 * confirmed by the user pressing a button, and the reference is only interesting
 * for as long as the payment is plausibly in flight. Expiring it keeps a stale
 * entry from shadowing the normal "pay" button weeks later, and keeps an old hash
 * from being resubmitted against a booking that may have moved on.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function savePendingPayment(slot: string, payment: PendingPayment): void {
  try {
    localStorage.setItem(
      STORAGE_PREFIX + slot,
      JSON.stringify({ ...payment, savedAt: Date.now() }),
    );
  } catch {
    // Private mode / quota exceeded: the in-memory state still works for this page.
  }
}

export function loadPendingPayment(slot: string): PendingPayment | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + slot);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PendingPayment | null;
    if (!parsed || (!parsed.txHash && !parsed.userOpHash)) return null;

    // Fail safe on an unknown age: without `savedAt` we cannot claim it is fresh.
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      clearPendingPayment(slot);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingPayment(slot: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + slot);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
