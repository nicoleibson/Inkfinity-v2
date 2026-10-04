// src/app/api/referral-payouts/route.ts
// Server-side REGISTRY for WEEKLY referral payouts, denominated in PLATFORM POINTS
// (internal currency, not on-chain tokens). Execution of the real-money transfer is done
// MANUALLY, OUTSIDE the platform (another institution, e.g. Mercado Pago). This route only:
//   1) GENERATES the payout order from the verified weekly referral earnings, and
//   2) CLOSES it once the admin confirms the external payment (markPaid).
// Nothing else writes users/{ref}/referralPayouts or referralEarnings or payoutRecords
// (rules: admin-only); only this route (firebase-admin) does.

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

const WEEK_KEY_RE = /^\d{4}-W\d{2}$/;

function isAdmin(user: any): boolean {
  const role = (user?.role || '').toString();
  return role === 'Administrator' || role === 'Super-Administrator';
}

export async function POST(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const adminUid = (body?.userId || '').toString().trim();
  const referrerId = (body?.referrerId || '').toString().trim();
  const weekKey = (body?.weekKey || '').toString().trim();
  const action = (body?.action || '').toString().trim();
  const scheduledFor = (body?.scheduledFor || '').toString().trim();
  const payoutTxHash = (body?.payoutTxHash || '').toString().trim();
  const external =
    body?.external && typeof body.external === 'object' && !Array.isArray(body.external) ? body.external : {};

  if (!adminUid || !referrerId || !weekKey || !WEEK_KEY_RE.test(weekKey)) {
    return NextResponse.json(
      { success: false, error: 'userId (admin), referrerId and weekKey (YYYY-Www) are required.' },
      { status: 400 },
    );
  }
  if (action !== 'schedule' && action !== 'markPaid') {
    return NextResponse.json(
      { success: false, error: 'action must be "schedule" or "markPaid".' },
      { status: 400 },
    );
  }

  const db = getAdminDb();

  const adminSnap = await db.ref(`users/${adminUid}`).get();
  if (!adminSnap.exists() || !isAdmin(adminSnap.val())) {
    return NextResponse.json(
      { success: false, error: 'Only an Administrator can manage referral payouts.' },
      { status: 403 },
    );
  }

  const earningsRef = db.ref(`users/${referrerId}/referralEarnings/${weekKey}`);
  const earningsSnap = await earningsRef.get();
  if (!earningsSnap.exists()) {
    return NextResponse.json(
      { success: false, error: 'No weekly referral earnings exist for that referrer/weekKey.' },
      { status: 404 },
    );
  }
  const earnings = earningsSnap.val();

  const payoutRef = db.ref(`users/${referrerId}/referralPayouts/${weekKey}`);
  const payoutRecordsRef = db.ref(`payoutRecords/${weekKey}`);

  // ---- GENERATE: build the payout order in POINTS from verified weekly earnings ----
  if (action === 'schedule') {
    if (!scheduledFor) {
      return NextResponse.json(
        { success: false, error: 'scheduledFor (target payout date) is required for action "schedule".' },
        { status: 400 },
      );
    }
    let scheduledMs = Date.parse(scheduledFor);
    if (Number.isNaN(scheduledMs)) {
      return NextResponse.json(
        { success: false, error: 'scheduledFor must be a valid date-time string.' },
        { status: 400 },
      );
    }

    // Points conversion rate is server-configured (points per wei of verified earnings).
    const settingsSnap = await db.ref('platform_settings/referralPayout').get();
    const pointsPerWei = settingsSnap.exists() && settingsSnap.val()
      ? String(settingsSnap.val().pointsPerWei || '')
      : '';
    if (!/^\d+$/.test(pointsPerWei)) {
      return NextResponse.json(
        { success: false, error: 'platform_settings/referralPayout.pointsPerWei (positive integer string) is not configured. Point payouts require a server-side rate.' },
        { status: 409 },
      );
    }

    const totalWei = BigInt(String(earnings?.totalWei || '0'));
    const pointsPerWeiBig = BigInt(pointsPerWei);
    const amountPoints = (totalWei * pointsPerWeiBig).toString();

    const nowIso = new Date().toISOString();
    const snapshot = {
      totalWei: totalWei.toString(),
      activatedReferrals: Number(earnings?.activatedReferrals || 0),
      weekStart: String(earnings?.weekStart || nowIso),
      weekEnd: String(earnings?.weekEnd || nowIso),
    };

    const updates: Record<string, any> = {
      [`users/${referrerId}/referralPayouts/${weekKey}`]: {
        weekKey,
        amountPoints,
        status: 'generated',
        generation: {
          createdAt: nowIso,
          triggeredBy: adminUid,
          source: 'weekly-manual', // no cron: an admin triggers each weekly payout.
          verified: true,
          snapshot,
        },
        external: {
          provider: (external.provider || 'mercadopago').toString(),
          status: 'pending',
          reference: (external.reference || '').toString(),
          initiatedAt: (external.initiatedAt || '').toString(),
          notes: (external.notes || '').toString(),
        },
        scheduledFor: new Date(scheduledMs).toISOString(),
        scheduledBy: adminUid,
        scheduledAt: nowIso,
        timeline: [
          {
            at: nowIso,
            action: 'generated',
            by: adminUid,
            detail: `Payout generated for ${weekKey} (${amountPoints} pts).`,
          },
        ],
      },
      [`users/${referrerId}/referralEarnings/${weekKey}/status`]: 'payoutScheduled',
    };

    // Weekly aggregate ledger (points), keyed by week for admin cross-checks.
    const recordSnap = await payoutRecordsRef.get();
    const record = recordSnap.exists() ? recordSnap.val() : {};
    const prevTotal = BigInt(String(record?.totalPoints || '0'));
    const prevOrders = Number(record?.openOrders || 0);
    updates[`payoutRecords/${weekKey}`] = {
      weekKey,
      totalPoints: (prevTotal + BigInt(amountPoints)).toString(),
      countOrders: Number(record?.countOrders || 0) + 1,
      openOrders: prevOrders + 1,
      generatedAt: record?.generatedAt || nowIso,
    };
    await db.ref().update(updates);

    return NextResponse.json({
      success: true,
      payoutStatus: 'generated',
      weekKey,
      amountPoints,
      scheduledFor: new Date(scheduledMs).toISOString(),
    });
  }

  // ---- MARK PAID: admin confirms the external transfer was executed (Mercado Pago). ----
  const extRef = (external.reference || '').toString().trim();
  const txRef = payoutTxHash || '';
  if (!extRef && !txRef) {
    return NextResponse.json(
      { success: false, error: 'external.reference (MP operation id) or payoutTxHash is required to confirm payment.' },
      { status: 400 },
    );
  }

  const existingSnap = await payoutRef.get();
  const existing = existingSnap.exists() ? existingSnap.val() : {};
  const nowIso2 = new Date().toISOString();
  const timeline = Array.isArray(existing?.timeline) ? existing.timeline : [];
  timeline.push({
    at: nowIso2,
    action: 'paid',
    by: adminUid,
    detail: `Confirmed via ${(external.provider || existing?.external?.provider || 'mercadopago').toString()} (${(extRef || txRef).toString()}).`,
  });

  const updates2: Record<string, any> = {
    [`users/${referrerId}/referralPayouts/${weekKey}`]: {
      ...existing,
      status: 'paid',
      external: {
        provider: (external.provider || existing?.external?.provider || 'mercadopago').toString(),
        status: 'paid',
        reference: extRef || String(existing?.external?.reference || ''),
        initiatedAt: String(existing?.external?.initiatedAt || ''),
        confirmedAt: nowIso2,
        notes: (external.notes || existing?.external?.notes || '').toString(),
      },
      paidBy: adminUid,
      paidAt: nowIso2,
      timeline,
    },
    [`users/${referrerId}/referralEarnings/${weekKey}/status`]: 'paid',
  };

  const recordSnap2 = await payoutRecordsRef.get();
  const record2 = recordSnap2.exists() ? recordSnap2.val() : {};
  const openOrders = Math.max(0, Number(record2?.openOrders || 0) - 1);
  updates2[`payoutRecords/${weekKey}`] = {
    ...record2,
    weekKey,
    totalPoints: (BigInt(String(record2?.totalPoints || '0'))).toString(),
    countOrders: Number(record2?.countOrders || 0),
    openOrders,
    closedAt: openOrders === 0 ? nowIso2 : record2?.closedAt || '',
  };
  await db.ref().update(updates2);

  return NextResponse.json({ success: true, payoutStatus: 'paid', weekKey });
}
