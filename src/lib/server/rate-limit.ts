import 'server-only';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Coarse abuse brake for individual API routes.
 *
 * This is a per-instance, in-memory fixed-window limiter. It resets on deploy,
 * is not shared between serverless instances and therefore cannot enforce a
 * global quota. It exists to stop one client from hammering an endpoint — for
 * example burning World ID signing/verification quota, spamming replay hashes,
 * or brute-forcing proofs — not to replace a shared store. If a global limit is
 * ever needed, swap the Map for Redis/Upstash behind this same API.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5_000;
const SWEEP_INTERVAL_MS = 60_000;

let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS && buckets.size <= MAX_BUCKETS) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  // Still oversized after dropping expired buckets: clear the table and fail
  // open. Losing counters is preferable to unbounded memory growth.
  if (buckets.size > MAX_BUCKETS) buckets.clear();

  lastSweep = now;
}

export type RateLimitOptions = {
  /** Bucket namespace, so two routes never share counters. */
  name: string;
  limit: number;
  windowMs: number;
  /**
   * Caller identifiers, most specific first (uid, then IP). The first
   * non-empty value is used. With no identifier the request is allowed: it is
   * better to skip limiting than to put every anonymous caller in one bucket.
   */
  identifiers: Array<string | null | undefined>;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export function checkRateLimit({
  name,
  limit,
  windowMs,
  identifiers,
}: RateLimitOptions): RateLimitResult {
  const identifier = identifiers.map((value) => (value || '').trim()).find(Boolean);

  if (!identifier) {
    return { allowed: true, limit, remaining: limit, retryAfterSeconds: 0 };
  }

  const now = Date.now();
  sweep(now);

  const key = `${name}:${identifier}`;
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);

  if (bucket.count > limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, limit, remaining, retryAfterSeconds: 0 };
}

/** Standard 429 response with rate-limit headers. */
export function rateLimitResponse(
  result: RateLimitResult,
  detail = 'Too many requests. Try again shortly.',
): NextResponse {
  return NextResponse.json(
    { error: 'RATE_LIMITED', detail, retryAfterSeconds: result.retryAfterSeconds },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}

/** Best-effort client IP. Vercel always sets `x-forwarded-for`. */
export function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return (
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('cf-connecting-ip')?.trim() ||
    null
  );
}
