import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/server/auth';
import { purgeUsedWorldIdProofs } from '@/lib/server/worldid-cleanup';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['Administrator', 'Super-Administrator']);

type PurgeRequest = {
  dryRun: boolean;
  retentionDays?: number;
  maxPerRun?: number;
};

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  return false;
}

function parsePositiveInt(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function readParams(source: URLSearchParams, body?: Record<string, unknown>): PurgeRequest {
  const get = (key: string) => body?.[key] ?? source.get(key) ?? undefined;
  return {
    dryRun: parseBoolean(get('dryRun') ?? get('dry_run')),
    retentionDays: parsePositiveInt(get('retentionDays') ?? get('retention_days')),
    maxPerRun: parsePositiveInt(get('maxPerRun') ?? get('max_per_run') ?? get('max')),
  };
}

/**
 * Authorises a purge run.
 *
 * Two callers exist: Vercel Cron (which sends `Authorization: Bearer
 * $CRON_SECRET`) and a signed-in administrator triggering it by hand. The cron
 * secret is compared directly; an administrator comes through Firebase Auth and
 * their role is re-read from RTDB so a stale/forged client claim cannot help.
 */
async function authorize(request: NextRequest): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const cronSecret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization') || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(header.trim())?.[1]?.trim();
  const querySecret = request.nextUrl.searchParams.get('secret')?.trim();

  if (cronSecret && (bearer === cronSecret || querySecret === cronSecret)) {
    return { ok: true };
  }

  const auth = await requireAuth(request);
  if (!auth.ok) {
    return { ok: false, status: auth.status, error: auth.error };
  }

  const roleSnapshot = await getAdminDb().ref(`users/${auth.user.uid}/role`).get();
  const role = roleSnapshot.exists() ? String(roleSnapshot.val()) : '';
  if (!ADMIN_ROLES.has(role)) {
    return { ok: false, status: 403, error: 'Administrator role required.' };
  }

  return { ok: true };
}

async function handle(request: NextRequest): Promise<Response> {
  const authorized = await authorize(request);
  if (!authorized.ok) {
    return NextResponse.json({ error: authorized.error }, { status: authorized.status });
  }

  let body: Record<string, unknown> | undefined;
  if (request.method === 'POST') {
    body = (await request.json().catch(() => undefined)) as Record<string, unknown> | undefined;
  }

  const { dryRun, retentionDays, maxPerRun } = readParams(request.nextUrl.searchParams, body);

  try {
    const result = await purgeUsedWorldIdProofs({
      db: getAdminDb(),
      dryRun,
      retentionDays,
      maxPerRun,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[worldid-proofs] purge failed:', error);
    return NextResponse.json(
      {
        error: 'PURGE_FAILED',
        detail: error instanceof Error ? error.message : 'Could not purge expired World ID proofs.',
      },
      { status: 500 },
    );
  }
}

/** Vercel Cron always issues GET, so a GET performs the real purge. */
export async function GET(request: NextRequest): Promise<Response> {
  return handle(request);
}

/** Manual runs (admin panel or curl) may pass options in the JSON body. */
export async function POST(request: NextRequest): Promise<Response> {
  return handle(request);
}
