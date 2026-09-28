import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, parseEther } from 'ethers';
import { getDatabase } from 'firebase-admin/database';
import { getAdminApp } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/server/auth';
import { getTokenPriceUsd, tokenSymbolForNetwork, usdToWeiFloor } from '@/lib/pricing';
import {
  isTxHash,
  resolveUserOpTransactionHash,
  verifyUserOpPayment,
} from '@/lib/server/userop-verification';
import { isSameAddress, isValidAddress } from '@/lib/server/address';
import { claimPaymentOnce, sanitizeClaimKey } from '@/lib/server/payment-claim';

export const runtime = 'nodejs';

/**
 * Server-side verification + settlement of booking payments.
 *
 * Previously `booking-list.tsx` flipped the booking status from the client as soon as
 * the wallet returned a hash — including for World App user operations, which are not
 * even mined at that point. That let anyone mark a deposit as paid without paying. The
 * status transition now happens here, after the transfer is proven on-chain, and the
 * caller must be the party that is supposed to have paid.
 */

const RPC_FALLBACK: Record<string, string> = {
  amoy: 'https://rpc-amoy.polygon.technology',
  polygon: 'https://polygon-rpc.com',
  worldchain: 'https://worldchain-mainnet.g.alchemy.com/public',
  worldchainSepolia: 'https://worldchain-sepolia.g.alchemy.com/public',
};

const REQUIRED_CONFIRMATIONS = 5;

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

function resolveBundlerUrl(network: string): string | undefined {
  if (network !== 'worldchain' && network !== 'worldchainSepolia') return undefined;
  const key =
    network === 'worldchain' ? 'RPC_WORLDCHAIN_BUNDLER_URL' : 'RPC_WORLDCHAIN_SEPOLIA_BUNDLER_URL';
  const value = (process.env[key] || '').trim();
  return value || undefined;
}

function errorResponse(status: number, error: string, code: string) {
  return NextResponse.json({ success: false, error, code }, { status });
}

type Intent = 'deposit' | 'refund';

export function POST(request: NextRequest) {
  return (async () => {
    const auth = await requireAuth(request);
    if (!auth.ok) {
      return errorResponse(auth.status, auth.error, 'UNAUTHENTICATED');
    }
    const uid = auth.user.uid;

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return errorResponse(400, 'Invalid JSON body.', 'INVALID_BODY');
    }

    const bookingId = (body?.bookingId || '').toString().trim();
    const intent = (body?.intent || 'deposit').toString().trim() as Intent;
    const txHash = (body?.txHash || '').toString().trim();
    const userOpHash = (body?.userOpHash || '').toString().trim();
    const network = (body?.network || 'worldchain').toString().trim();

    if (!bookingId) return errorResponse(400, 'bookingId is required.', 'MISSING_BOOKING_ID');
    if (intent !== 'deposit' && intent !== 'refund') {
      return errorResponse(400, 'intent must be "deposit" or "refund".', 'INVALID_INTENT');
    }
    if (!isTxHash(txHash) && !isTxHash(userOpHash)) {
      return errorResponse(400, 'A valid txHash or userOpHash is required.', 'MISSING_PAYMENT_HASH');
    }
    if (txHash && userOpHash) {
      return errorResponse(400, 'Provide either txHash or userOpHash, not both.', 'AMBIGUOUS_PAYMENT_HASH');
    }
    if (!['amoy', 'polygon', 'worldchain', 'worldchainSepolia'].includes(network)) {
      return errorResponse(400, 'Unsupported network.', 'INVALID_NETWORK');
    }

    const db = getDatabase(getAdminApp());
    const bookingRef = db.ref(`bookings/${bookingId}`);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists()) {
      return errorResponse(404, 'Booking not found.', 'BOOKING_NOT_FOUND');
    }
    const booking = bookingSnap.val();

    // Authorization: the client pays the deposit, the artist refunds it.
    const isClient = booking.clientId === uid;
    const isArtist = booking.artistId === uid;
    if (intent === 'deposit' && !isClient) {
      return errorResponse(403, 'Only the booking client can pay the deposit.', 'FORBIDDEN');
    }
    if (intent === 'refund' && !isArtist) {
      return errorResponse(403, 'Only the artist can issue a deposit refund.', 'FORBIDDEN');
    }

    if (intent === 'deposit' && booking.status !== 'awaiting_payment') {
      return errorResponse(
        409,
        `This booking is not awaiting payment (status: ${booking.status}).`,
        'INVALID_BOOKING_STATE',
      );
    }
    if (intent === 'refund' && booking.status !== 'confirmed') {
      return errorResponse(
        409,
        `Only a confirmed booking can be refunded (status: ${booking.status}).`,
        'INVALID_BOOKING_STATE',
      );
    }

    const depositAmount = Number(booking.depositAmount || 0);
    if (!depositAmount || depositAmount <= 0) {
      return errorResponse(422, 'This booking has no deposit to settle.', 'NO_DEPOSIT');
    }

    // The recipient differs per intent, and so does the amount floor. `depositAmount`
    // is stored in USD and converted with a live price, so the server recomputes the
    // floor itself (with a tolerance for price movement) instead of trusting a
    // client-quoted figure. Without a price the settlement fails closed: an amount
    // bound that cannot be computed is not a bound.
    const expectedRecipient =
      intent === 'deposit' ? booking.artistWalletAddress : booking.clientWalletAddress;
    // The payer must be compared as an on-chain address. `clientId`/`artistId` are
    // Firebase UIDs, not addresses: comparing them against the transaction sender
    // rejected every legitimate deposit and refund.
    const payer = intent === 'deposit' ? booking.clientWalletAddress : booking.artistWalletAddress;

    if (!expectedRecipient || !/^0x[0-9a-fA-F]{40}$/.test(expectedRecipient)) {
      return errorResponse(
        422,
        intent === 'deposit'
          ? 'The artist has no wallet address recorded; the deposit cannot be settled.'
          : 'The client has no wallet address recorded; the refund cannot be sent.',
        'MISSING_RECIPIENT',
      );
    }
    if (!isValidAddress(payer)) {
      return errorResponse(
        422,
        intent === 'deposit'
          ? 'Your wallet address is not recorded on this booking; the deposit cannot be verified.'
          : 'The artist has no wallet address recorded on this booking; the refund cannot be verified.',
        'MISSING_PAYER_WALLET',
      );
    }

    const priceUsd = await getTokenPriceUsd(tokenSymbolForNetwork(network));
    if (!priceUsd) {
      return errorResponse(
        503,
        'The reference token price is temporarily unavailable, so the deposit amount cannot be verified. The transfer was not consumed; try again shortly.',
        'PRICE_UNAVAILABLE',
      );
    }
    const minValueWei = usdToWeiFloor(depositAmount, priceUsd);

    const rpcUrl = resolveRpc(network);
    if (!rpcUrl) {
      return errorResponse(500, `No RPC URL configured for "${network}".`, 'RPC_NOT_CONFIGURED');
    }
    const provider = new JsonRpcProvider(rpcUrl);

    // Replay protection: one payment reference settles one booking transition.
    const claimKey = `${network}:${bookingId}:${intent}`;
    const nextStatus = intent === 'deposit' ? 'confirmed' : 'cancelled';
    const hashField = intent === 'deposit' ? 'paymentTxHash' : 'cancellationTxHash';
    const confirmedField = `${intent === 'deposit' ? 'deposit' : 'refund'}ConfirmedAt`;
    const stateBefore = intent === 'deposit' ? 'awaiting_payment' : 'confirmed';

    // Idempotent settlement: writing the same transition twice is harmless, which is
    // what makes crash recovery possible below.
    const settleBooking = (paymentRef: string) =>
      bookingRef.update({
        status: nextStatus,
        [hashField]: paymentRef,
        [confirmedField]: new Date().toISOString(),
      });

    const claimSnap = await db.ref(`payment_claims/${sanitizeClaimKey(claimKey)}`).get();
    if (claimSnap.exists()) {
      const existing = claimSnap.val();
      if (existing?.userId === uid && existing?.kind === `booking:${intent}`) {
        // The settlement either finished (booking already moved on) or was
        // interrupted after the claim was consumed. Re-apply it instead of
        // reporting "already used", which would strand a paid booking forever.
        if (booking.status === nextStatus) {
          return NextResponse.json({
            success: true,
            status: nextStatus,
            paymentRef: existing.paymentRef,
            alreadySettled: true,
          });
        }
        if (booking.status === stateBefore) {
          await settleBooking(existing.paymentRef);
          return NextResponse.json({
            success: true,
            status: nextStatus,
            paymentRef: existing.paymentRef,
          });
        }
      }
      return errorResponse(409, 'This booking payment has already been settled.', 'PAYMENT_ALREADY_USED');
    }

    let paymentRef: string;

    if (userOpHash) {
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
          'Could not reach the World Developer Portal to confirm the transaction.',
          'USEROP_LOOKUP_FAILED',
        );
      }

      const result = await verifyUserOpPayment({
        provider,
        userOpHash,
        transactionHash: resolved.transactionHash,
        expectedTo: expectedRecipient,
        minValueWei,
        bundlerUrl: resolveBundlerUrl(network),
        treasuryAddress: expectedRecipient,
        requiredConfirmations: REQUIRED_CONFIRMATIONS,
      });
      if (!result.ok) {
        return errorResponse(result.status, result.error, result.code);
      }
      if (!result.resolution.sender) {
        return errorResponse(
          422,
          'Could not determine the account that sent the payment.',
          'SENDER_UNKNOWN',
        );
      }
      if (!isSameAddress(result.resolution.sender, payer)) {
        return errorResponse(
          422,
          'The transaction was sent by a different account than the expected payer.',
          'WRONG_SENDER',
        );
      }

      paymentRef = userOpHash;
    } else {
      const tx = await provider.getTransaction(txHash);
      if (!tx) return errorResponse(422, 'Transaction not found on-chain.', 'TX_NOT_FOUND');
      if (!tx.to || tx.to.toLowerCase() !== expectedRecipient.toLowerCase()) {
        return errorResponse(
          422,
          intent === 'deposit'
            ? 'The deposit was not sent to the artist wallet.'
            : 'The refund was not sent to the client wallet.',
          'WRONG_RECIPIENT',
        );
      }
      if (tx.value < minValueWei) {
        return errorResponse(
          422,
          `The transferred amount is below the required deposit (expected at least ${minValueWei} wei for a ${depositAmount} USD deposit at ${priceUsd} USD per ${tokenSymbolForNetwork(network)}).`,
          'INSUFFICIENT_VALUE',
        );
      }
      if (!isSameAddress(tx.from, payer)) {
        return errorResponse(
          422,
          'The transaction was sent by a different account than the expected payer.',
          'WRONG_SENDER',
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
        return errorResponse(422, 'The transaction reverted on-chain.', 'TX_REVERTED');
      }
      const head = await provider.getBlockNumber();
      if (head - receipt.blockNumber + 1 < REQUIRED_CONFIRMATIONS) {
        return errorResponse(
          202,
          `The transaction has only ${head - receipt.blockNumber + 1} confirmation(s). Try again shortly.`,
          'TX_PENDING',
        );
      }

      paymentRef = txHash;
    }

    // Consume the claim atomically so two concurrent requests cannot both settle
    // the same booking, then apply the transition. If the second write fails, the
    // next retry detects the consumed-but-unsettled claim above and finishes it.
    const claim = await claimPaymentOnce(db, claimKey, {
      userId: uid,
      kind: `booking:${intent}`,
      bookingId,
      network,
      paymentRef,
      userOpHash: userOpHash || null,
      claimedAt: new Date().toISOString(),
    });
    if (!claim.ok) {
      return errorResponse(500, claim.error, 'CLAIM_WRITE_FAILED');
    }

    const settledRef = claim.created ? paymentRef : (claim.existing?.paymentRef as string) || paymentRef;
    await settleBooking(settledRef);

    return NextResponse.json({
      success: true,
      status: nextStatus,
      paymentRef: settledRef,
    });
  })().catch((error: unknown) => {
    console.error('verify-booking-payment error:', error);
    const message = error instanceof Error ? error.message : 'Booking payment verification failed.';
    return NextResponse.json({ success: false, error: message, code: 'SERVER_ERROR' }, { status: 500 });
  });
}
