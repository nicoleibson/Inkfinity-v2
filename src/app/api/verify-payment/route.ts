import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, parseEther } from 'ethers';
import { getDatabase } from 'firebase-admin/database';
import { getAdminApp } from '@/lib/firebase-admin';
import { add, getISOWeek, getISOWeekYear } from 'date-fns';
import { requireAuth } from '@/lib/server/auth';
import {
  isTxHash,
  resolveUserOpTransactionHash,
  verifyUserOpPayment,
} from '@/lib/server/userop-verification';

export const runtime = 'nodejs';

const PLATFORM_WALLET = (
  process.env.NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS ||
  process.env.PLATFORM_WALLET_ADDRESS ||
  ''
).trim();

const RPC_FALLBACK: Record<string, string> = {
  amoy: 'https://rpc-amoy.polygon.technology',
  polygon: 'https://polygon-rpc.com',
  worldchain: 'https://worldchain-mainnet.g.alchemy.com/public',
  worldchainSepolia: 'https://worldchain-sepolia.g.alchemy.com/public',
};

/**
 * Optional bundler RPC. Public World Chain RPCs reject `eth_getUserOperationByHash`
 * (`401: Only core evm requests are allowed.`), so exact userOp verification needs a
 * dedicated bundler. Without it the route falls back to a treasury balance-delta
 * check, which is weaker but still fail-closed.
 */
function resolveBundlerUrl(network: string): string | undefined {
  if (network !== 'worldchain' && network !== 'worldchainSepolia') return undefined;
  const key = network === 'worldchain' ? 'RPC_WORLDCHAIN_BUNDLER_URL' : 'RPC_WORLDCHAIN_SEPOLIA_BUNDLER_URL';
  const value = (process.env[key] || '').trim();
  return value || undefined;
}

function resolveRpc(network: string): string {
  const envKey =
    network === 'amoy'
      ? 'RPC_AMOY_URL'
      : network === 'worldchain'
        ? 'RPC_WORLDCHAIN_URL'
        : network === 'worldchainSepolia'
          ? 'RPC_WORLDCHAIN_SEPOLIA_URL'
          : 'RPC_POLYGON_URL';
  return (process.env[envKey] || '').trim() || RPC_FALLBACK[network] || '';
}

function errorResponse(status: number, error: string, code: string) {
  return NextResponse.json({ success: false, error, code }, { status });
}

export function POST(request: NextRequest) {
  return (async () => {
    // This route uses the Admin SDK, which bypasses database.rules.json. The caller
    // must prove who they are, and the user id is taken from the verified token only
    // (a body-supplied userId would let anyone claim another user's payment).
    const auth = await requireAuth(request);
    if (!auth.ok) {
      return errorResponse(auth.status, auth.error, 'UNAUTHENTICATED');
    }
    const userId = auth.user.uid;

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return errorResponse(400, 'Invalid JSON body.', 'INVALID_BODY');
    }

    const txHash = (body?.txHash || '').toString().trim();
    const userOpHash = (body?.userOpHash || '').toString().trim();
    const network = (body?.network || 'worldchain').toString().trim();
    const claimsFreePassage = body?.freePassage === true;

    if (txHash && userOpHash) {
      return errorResponse(400, 'Provide either txHash or userOpHash, not both.', 'AMBIGUOUS_PAYMENT_HASH');
    }
    if (!isTxHash(txHash) && !isTxHash(userOpHash) && !claimsFreePassage) {
      return errorResponse(400, 'A valid txHash or userOpHash is required.', 'MISSING_PAYMENT_HASH');
    }
    if (!['amoy', 'polygon', 'worldchain', 'worldchainSepolia'].includes(network)) {
      return errorResponse(
        400,
        'network must be "amoy", "polygon", "worldchain" or "worldchainSepolia".',
        'INVALID_NETWORK',
      );
    }
    if (!PLATFORM_WALLET) {
      return errorResponse(500, 'The platform wallet is not configured.', 'WALLET_NOT_CONFIGURED');
    }

    const rpcUrl = resolveRpc(network);
    if (!rpcUrl) {
      return errorResponse(500, `No RPC URL configured for "${network}".`, 'RPC_NOT_CONFIGURED');
    }

    const db = getDatabase(getAdminApp());

    // --- Identity + expected fee first: everything below compares against this. ---
    const userSnap = await db.ref(`users/${userId}`).get();
    if (!userSnap.exists()) {
      return errorResponse(404, 'User profile not found.', 'USER_NOT_FOUND');
    }
    const user = userSnap.val();

    const settingsSnap = await db.ref('platform_settings').get();
    const settings = settingsSnap.exists() ? settingsSnap.val() : {};

    const baseFee =
      user.role === 'Tattoo Artist'
        ? settings.artistMembershipTiers?.tier1 || 0
        : user.role === 'Studio'
          ? settings.studioRegistrationFee || 0
          : user.role === 'Supply Store'
            ? settings.supplyStoreRegistrationFee || 0
            : 0;

    let referralMultiplier = 1;
    if (user.referralCodeUsed && user.referredBy) {
      const referralSnap = await db.ref(`referrals/${user.referralCodeUsed}`).get();
      if (referralSnap.exists()) {
        const discountPct = referralSnap.val()?.discountPercentage || 0;
        referralMultiplier = 1 - discountPct / 100;
      }
    }

    const expectedFee = baseFee * referralMultiplier;
    const minValueWei = parseEther(expectedFee.toFixed(18));

    // A fully discounted (or unconfigured) fee cannot be proven on-chain. The client may
    // explicitly ask for the free path; the server independently confirms the fee is
    // really zero before granting anything.
    const freePassage = minValueWei <= BigInt(0);
    if (freePassage && !claimsFreePassage) {
      return errorResponse(
        422,
        'No membership fee is due for this account, so no payment is required.',
        'NO_FEE_DUE',
      );
    }
    if (!freePassage && claimsFreePassage) {
      return errorResponse(400, 'A payment is required for this account.', 'PAYMENT_REQUIRED');
    }

    // --- Free path (no payment to verify) ------------------------------------
    // Bounded by the account state rather than by a payment reference: the trial is only
    // (re)started when it is missing or expired, so repeatedly calling this endpoint can
    // never stack extra years onto an already-valid membership.
    if (freePassage) {
      const currentTrialEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
      const trialStillValid =
        user.status === 'active' && currentTrialEndsAt !== null && currentTrialEndsAt.getTime() > Date.now();

      if (trialStillValid) {
        return NextResponse.json({
          success: true,
          txHash: null,
          userOpHash: null,
          freePassage: true,
          alreadyActive: true,
        });
      }

      const updates: Record<string, string> = {
        status: 'active',
        paymentDate: new Date().toISOString(),
      };
      if (user.role === 'Tattoo Artist') {
        updates.trialEndsAt = add(new Date(), { years: 1 }).toISOString();
      }
      await db.ref(`users/${userId}`).update(updates);

      return NextResponse.json({ success: true, txHash: null, userOpHash: null, freePassage: true });
    }

    // --- Replay protection ---------------------------------------------------
    // The same payment reference must never be redeemed twice: previously the
    // endpoint had no such check, so replaying one txHash granted an extra year of
    // membership (and another referral commission) on every call.
    const claimKey = `${network}:${userOpHash || txHash}`.toLowerCase();
    const claimRef = db.ref(`payment_claims/${claimKey.replace(/[^a-z0-9:-]/g, '')}`);
    const claimSnap = await claimRef.get();

    if (claimSnap.exists()) {
      const claim = claimSnap.val();
      if (claim?.userId === userId && claim?.kind === 'membership') {
        // Idempotent retry of a payment already credited to this same user.
        return NextResponse.json({
          success: true,
          txHash: claim?.paymentRef || txHash,
          userOpHash: userOpHash || null,
          alreadyCredited: true,
        });
      }
      return errorResponse(
        409,
        'This payment has already been used.',
        'PAYMENT_ALREADY_USED',
      );
    }

    // --- On-chain verification ----------------------------------------------
    const provider = new JsonRpcProvider(rpcUrl);
    let paymentRef: string;
    let verificationNote: string;

    if (userOpHash) {
      // World App settles via ERC-4337. Resolve the settling transaction, then verify
      // the userOp itself (EntryPoint event + exact to/value when a bundler is set up).
      const resolved = await resolveUserOpTransactionHash(userOpHash, {
        timeoutMs: 45_000,
        intervalMs: 3_000,
      });

      if (resolved.state === 'pending') {
        return errorResponse(
          202,
          'The transaction is still pending confirmation. Try again in a few seconds.',
          'TX_PENDING',
        );
      }
      if (resolved.state === 'failed') {
        return errorResponse(422, resolved.detail, 'USEROP_FAILED');
      }
      if (resolved.state === 'unavailable') {
        return errorResponse(
          502,
          'Could not reach the World Developer Portal to confirm the transaction. Nothing was charged to your account.',
          'USEROP_LOOKUP_FAILED',
        );
      }

      const userOpResult = await verifyUserOpPayment({
        provider,
        userOpHash,
        transactionHash: resolved.transactionHash,
        expectedTo: PLATFORM_WALLET,
        minValueWei,
        bundlerUrl: resolveBundlerUrl(network),
        treasuryAddress: PLATFORM_WALLET,
      });

      if (!userOpResult.ok) {
        return errorResponse(userOpResult.status, userOpResult.error, userOpResult.code);
      }

      paymentRef = userOpHash;
      verificationNote = userOpResult.resolution.exactRecipientVerified
        ? 'userop-verified-exact'
        : 'userop-verified-balance-delta';
    } else {
      const tx = await provider.getTransaction(txHash);
      if (!tx) {
        return errorResponse(422, 'Transaction not found on-chain.', 'TX_NOT_FOUND');
      }
      if (!tx.to || tx.to.toLowerCase() !== PLATFORM_WALLET.toLowerCase()) {
        return errorResponse(422, 'Transaction recipient is not the platform wallet.', 'WRONG_RECIPIENT');
      }
      if (tx.value < minValueWei) {
        return errorResponse(
          422,
          'Transaction value is below the required membership fee.',
          'INSUFFICIENT_VALUE',
        );
      }

      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) {
        return errorResponse(
          202,
          'The transaction is still pending confirmation. Try again in a few seconds.',
          'TX_PENDING',
        );
      }
      if (receipt.status !== 1) {
        return errorResponse(
          422,
          'Transaction reverted on-chain (status !== 1). Payment NOT credited.',
          'TX_REVERTED',
        );
      }

      // Require a minimum confirmation depth so a reorg cannot credit a payment that
      // later disappears from the chain.
      const REQUIRED_CONFIRMATIONS = 5;
      const head = await provider.getBlockNumber();
      if (head - receipt.blockNumber + 1 < REQUIRED_CONFIRMATIONS) {
        return errorResponse(
          202,
          `The transaction has only ${head - receipt.blockNumber + 1} confirmation(s). Try again shortly.`,
          'TX_PENDING',
        );
      }

      paymentRef = txHash;
      verificationNote = 'tx-verified';
    }

    // --- Credit the payment --------------------------------------------------
    const updates: Record<string, string> = {
      status: 'active',
      paymentDate: new Date().toISOString(),
      paymentTxHash: paymentRef,
    };
    if (user.role === 'Tattoo Artist') {
      updates.trialEndsAt = add(new Date(), { years: 1 }).toISOString();
    }

    // Claim first: if this write fails, nothing is credited, so a crash between the
    // two cannot double-credit.
    await claimRef.set({
      userId,
      kind: 'membership',
      network,
      paymentRef,
      userOpHash: userOpHash || null,
      verification: verificationNote,
      claimedAt: new Date().toISOString(),
    });
    await db.ref(`users/${userId}`).update(updates);

    // ---- Semanal: acumular comisión al referidor (recién pagó el referido) ----
    // El referidor NO escribe este path: solo el server (admin SDK, supera reglas).
    // totalWei se acumula server-side como string (BigInt) para evitar overflow 2^53.
    if (user.referralCodeUsed && user.referredBy) {
      const referralSnap2 = await db.ref(`referrals/${user.referralCodeUsed}`).get();
      const commissionPct = referralSnap2.val()?.commissionPercentage || 0;
      const referrerId = (referralSnap2.val()?.referrerId || user.referredBy || '').toString();

      if (referrerId && commissionPct > 0 && referrerId !== userId) {
        const now = new Date();
        const weekKey = `${getISOWeekYear(now)}-W${String(getISOWeek(now)).padStart(2, '0')}`; // "2026-W39"

        const earningsRef = db.ref(`users/${referrerId}/referralEarnings/${weekKey}`);
        const [prevTotal, prevCount] = await Promise.all([
          earningsRef.child('totalWei').get(),
          earningsRef.child('activatedReferrals').get(),
        ]);
        const prevWei = prevTotal.exists() ? BigInt(prevTotal.val() || '0') : BigInt('0');
        const prevAct = prevCount.exists() ? parseInt(prevCount.val() || '0', 10) : 0;
        const commissionWei =
          (BigInt(minValueWei) * BigInt(Math.round(commissionPct * 100))) / BigInt('10000');

        const referenceUpdates: Record<string, unknown> = {};
        referenceUpdates[`users/${referrerId}/referralEarnings/${weekKey}/totalWei`] = (
          prevWei + commissionWei
        ).toString();
        referenceUpdates[`users/${referrerId}/referralEarnings/${weekKey}/activatedReferrals`] =
          prevAct + 1;
        referenceUpdates[`users/${referrerId}/referralEarnings/${weekKey}/lastActivationAt`] =
          new Date().toISOString();
        referenceUpdates[`users/${referrerId}/referralEarnings/${weekKey}/weekStart`] =
          new Date().toISOString();
        referenceUpdates[`users/${referrerId}/referralEarnings/${weekKey}/weekEnd`] =
          new Date().toISOString();
        referenceUpdates[`users/${referrerId}/referralEarnings/${weekKey}/status`] = 'open';
        await db.ref().update(referenceUpdates);
      }
    }

    return NextResponse.json({
      success: true,
      txHash: userOpHash ? null : paymentRef,
      userOpHash: userOpHash || null,
      verification: verificationNote,
    });
  })().catch((error: unknown) => {
    console.error('verify-payment error:', error);
    const message = error instanceof Error ? error.message : 'Payment verification failed.';
    return NextResponse.json({ success: false, error: message, code: 'SERVER_ERROR' }, { status: 500 });
  });
}
