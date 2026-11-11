import 'server-only';
import type { Database } from 'firebase-admin/database';

/**
 * Retention for `worldId_used_proofs`.
 *
 * That node exists only to reject reused IDKit payloads (anti-replay): every
 * verified proof stores its SHA-256 hash as a key. A proof is worthless once
 * its RP signature has expired (World ID proofs are short-lived), so keeping
 * them forever only grows the database and lengthens every replay lookup.
 *
 * Each entry is a bare timestamp (older writes) or an object with a timestamp
 * field, so parsing is defensive on purpose: an entry we cannot date is left
 * alone rather than deleted, because deleting a live hash would re-open replay.
 */

export type PurgeOptions = {
  db: Database;
  /** Entries older than this many days are deleted. Defaults to 90. */
  retentionDays?: number;
  /** Report what would be deleted without writing anything. */
  dryRun?: boolean;
  /** Hard cap per run, so one cron invocation cannot run away. Defaults to 5000. */
  maxPerRun?: number;
  /** Timestamp used as "now" (tests). Defaults to Date.now(). */
  now?: number;
};

export type PurgeResult = {
  retentionDays: number;
  cutoff: string;
  dryRun: boolean;
  scanned: number;
  purged: number;
  skipped: number;
  remainingCandidates: number;
  truncated: boolean;
};

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_MAX_PER_RUN = 5_000;
const DELETE_CONCURRENCY = 100;

/** Reads a millisecond timestamp out of whatever shape the entry uses. */
export function readProofTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Defensive: a value in seconds would look like 1970 in ms.
    return value < 1e12 ? value * 1000 : value;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['usedAt', 'createdAt', 'timestamp', 'verifiedAt']) {
      const parsed = readProofTimestamp(record[key]);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

export function getProofRetentionDays(): number {
  const raw = Number(process.env.WORLD_ID_PROOF_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_RETENTION_DAYS;
}

/**
 * Deletes used-proof hashes older than the retention window.
 *
 * The whole node is read once: these keys are tiny, and a value query would
 * skip object-shaped entries. Deletion then runs in bounded parallel batches so
 * a large backlog does not open thousands of sockets at once.
 */
export async function purgeUsedWorldIdProofs({
  db,
  retentionDays = getProofRetentionDays(),
  dryRun = false,
  maxPerRun = DEFAULT_MAX_PER_RUN,
  now = Date.now(),
}: PurgeOptions): Promise<PurgeResult> {
  const cutoffMs = now - retentionDays * 24 * 60 * 60 * 1000;

  const snapshot = await db.ref('worldId_used_proofs').get();
  const entries = snapshot.exists() ? Object.entries(snapshot.val() as Record<string, unknown>) : [];

  const expiredKeys: string[] = [];
  let skipped = 0;

  for (const [key, value] of entries) {
    const timestamp = readProofTimestamp(value);
    if (timestamp === null) {
      skipped += 1;
      continue;
    }
    if (timestamp < cutoffMs) expiredKeys.push(key);
  }

  const toDelete = expiredKeys.slice(0, maxPerRun);

  if (!dryRun) {
    for (let index = 0; index < toDelete.length; index += DELETE_CONCURRENCY) {
      const batch = toDelete.slice(index, index + DELETE_CONCURRENCY);
      await Promise.all(batch.map((key) => db.ref(`worldId_used_proofs/${key}`).remove()));
    }
  }

  return {
    retentionDays,
    cutoff: new Date(cutoffMs).toISOString(),
    dryRun,
    scanned: entries.length,
    purged: toDelete.length,
    skipped,
    remainingCandidates: expiredKeys.length - toDelete.length,
    truncated: expiredKeys.length > maxPerRun,
  };
}
