// src/lib/face-lock.ts
// Client-side rate limiting for facial verification attempts. Backed by the
// user's Realtime Database record so lockout survives page reloads.
// Consecutive failures increase the lock time exponentially.

import { database } from "@/lib/firebase-config";
import { get, ref, runTransaction, update } from "firebase/database";

const LOCK_STEPS = [
  { after: 3, durationMs: 30_000 },
  { after: 5, durationMs: 300_000 },
  { after: 7, durationMs: 1_800_000 },
];
const MAX_LOCK_MS = 30 * 60_000;

interface FacialAttempts {
  failed?: number;
  lockedUntil?: number | null;
}

function attemptsRef(uid: string) {
  return ref(database, `users/${uid}/facialAttempts`);
}

export interface VerificationLockState {
  allowed: boolean;
  retryAfterMs: number;
  failed: number;
}

export async function getVerificationLock(uid: string): Promise<VerificationLockState> {
  const snapshot = await get(attemptsRef(uid));
  const data = (snapshot.val() ?? {}) as FacialAttempts;
  const now = Date.now();
  const lockedUntil = typeof data.lockedUntil === "number" ? data.lockedUntil : 0;
  const failed = data.failed ?? 0;

  if (lockedUntil > now) {
    return { allowed: false, retryAfterMs: lockedUntil - now, failed };
  }
  return { allowed: true, retryAfterMs: 0, failed };
}

export async function registerVerificationFailure(uid: string): Promise<void> {
  try {
    await runTransaction(attemptsRef(uid), (current) => {
      const data = (current ?? {}) as FacialAttempts;
      if (typeof data.lockedUntil === "number" && data.lockedUntil > Date.now()) {
        return current;
      }
      const failed = (data.failed ?? 0) + 1;
      let lockedUntil: number | null = null;
      for (let i = LOCK_STEPS.length - 1; i >= 0; i--) {
        if (failed >= LOCK_STEPS[i].after) {
          lockedUntil = Date.now() + Math.min(MAX_LOCK_MS, LOCK_STEPS[i].durationMs);
          break;
        }
      }
      return { failed, lockedUntil };
    });
  } catch (error) {
    console.error("registerVerificationFailure failed:", error);
  }
}

export async function resetVerificationFailures(uid: string): Promise<void> {
  try {
    await update(attemptsRef(uid), { failed: 0, lockedUntil: null });
  } catch (error) {
    console.error("resetVerificationFailures failed:", error);
  }
}

export function formatRetryTime(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes} min`;
}