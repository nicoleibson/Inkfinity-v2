'use client';

import { auth } from '@/lib/firebase-config';

/**
 * Client helpers for the payment verification endpoints.
 *
 * Two things every caller needs and previously lacked:
 *  1. The Firebase ID token. Both endpoints use the Admin SDK (which bypasses
 *     database.rules.json), so they require `Authorization: Bearer <idToken>` and take
 *     the acting user from the verified token.
 *  2. Retrying while the chain has not confirmed yet. The endpoints answer HTTP 202
 *     while a payment is still pending; treating that as a failure meant users paid and
 *     got an error with nothing activated.
 */

export type VerifyResponse = {
  success: boolean;
  error?: string;
  code?: string;
  [key: string]: unknown;
};

export class PaymentPendingError extends Error {
  readonly code = 'TX_PENDING';
  constructor() {
    super('The payment is still being confirmed on-chain.');
  }
}

export class PaymentVerificationError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function getIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new PaymentVerificationError('You must be signed in.', 'UNAUTHENTICATED', 401);
  return user.getIdToken();
}

/**
 * POSTs to a verification endpoint, retrying while it answers 202 (pending) until
 * `timeoutMs` elapses.
 */
export async function verifyWithPolling(
  endpoint: string,
  body: Record<string, unknown>,
  options: { timeoutMs?: number; intervalMs?: number; onPending?: (attempt: number) => void } = {},
): Promise<VerifyResponse> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 4_000;
  const deadline = Date.now() + timeoutMs;

  const token = await getIdToken();
  let attempt = 0;

  for (;;) {
    attempt += 1;

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new PaymentVerificationError(
        error instanceof Error ? error.message : 'Network error while verifying the payment.',
        'NETWORK_ERROR',
        0,
      );
    }

    let data: VerifyResponse;
    try {
      data = (await res.json()) as VerifyResponse;
    } catch {
      throw new PaymentVerificationError('The server returned an unreadable response.', 'BAD_RESPONSE', res.status);
    }

    if (res.status === 202) {
      // Still confirming: keep waiting instead of surfacing a failure.
      if (Date.now() >= deadline) throw new PaymentPendingError();
      options.onPending?.(attempt);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      continue;
    }

    if (!res.ok || !data.success) {
      throw new PaymentVerificationError(
        data.error || 'Payment verification failed.',
        data.code || 'VERIFY_FAILED',
        res.status,
      );
    }

    return data;
  }
}
