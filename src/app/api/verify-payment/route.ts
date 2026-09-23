import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, parseEther } from 'ethers';
import { getDatabase } from 'firebase-admin/database';
import { getAdminApp } from '@/lib/firebase-admin';
import { add, getISOWeek, getISOWeekYear } from 'date-fns';

export const runtime = 'nodejs';

const PLATFORM_WALLET = (process.env.NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS || process.env.PLATFORM_WALLET_ADDRESS || '');

const RPC_FALLBACK: Record<string, string> = {
  amoy: 'https://rpc-amoy.polygon.technology',
  polygon: 'https://polygon-rpc.com',
};

function resolveRpc(network: string): string {
  const envKey = network === 'amoy' ? 'RPC_AMOY_URL' : 'RPC_POLYGON_URL';
  return (process.env[envKey] || '').trim() || RPC_FALLBACK[network] || '';
}

export function POST(request: NextRequest) {
  return (async () => {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
    }

    const txHash = (body?.txHash || '').toString().trim();
    const userId = (body?.userId || '').toString().trim();
    const network = (body?.network || 'amoy').toString().trim();

    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return NextResponse.json({ success: false, error: 'A valid txHash is required.' }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required.' }, { status: 400 });
    }
    if (network !== 'amoy' && network !== 'polygon') {
      return NextResponse.json({ success: false, error: 'network must be "amoy" or "polygon".' }, { status: 400 });
    }

    const rpcUrl = resolveRpc(network);
    if (!rpcUrl) {
      return NextResponse.json({ success: false, error: `No RPC URL configured for "${network}".` }, { status: 500 });
    }

    const provider = new JsonRpcProvider(rpcUrl);

    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found on-chain.', code: 'TX_NOT_FOUND' }, { status: 422 });
    }

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return NextResponse.json({ success: false, error: 'Transaction is pending (not yet confirmed).', code: 'TX_PENDING' }, { status: 202 });
    }
    if (receipt.status !== 1) {
      return NextResponse.json({ success: false, error: 'Transaction reverted on-chain (status !== 1). Payment NOT credited.', code: 'TX_REVERTED' }, { status: 422 });
    }

    const toChecksum =
      process.env.NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS ||
      process.env.PLATFORM_WALLET_ADDRESS ||
      '';
    if (!tx.to || tx.to.toLowerCase() !== toChecksum.toLowerCase()) {
      return NextResponse.json({ success: false, error: 'Transaction recipient is not the platform wallet.', code: 'WRONG_RECIPIENT' }, { status: 422 });
    }

    const db = getDatabase(getAdminApp());

    const settingsSnap = await db.ref('platform_settings').get();
    const settings = settingsSnap.exists() ? settingsSnap.val() : {};

    const userSnap = await db.ref(`users/${userId}`).get();
    if (!userSnap.exists()) {
      return NextResponse.json({ success: false, error: 'User profile not found.' }, { status: 404 });
    }
    const user = userSnap.val();

    let baseFee =
      user.role === 'Tattoo Artist'
        ? settings.artistMembershipTiers?.tier1 || 0
        : user.role === 'Studio'
          ? settings.studioRegistrationFee || 0
          : user.role === 'Supply Store'
            ? settings.supplyStoreRegistrationFee || 0
            : 0;

    let expectedFee = baseFee;
    let referralMultiplier = 1;
    if (user.referralCodeUsed && user.referredBy) {
      const referralSnap = await db.ref(`referrals/${user.referralCodeUsed}`).get();
      if (referralSnap.exists()) {
        const discountPct = referralSnap.val()?.discountPercentage || 0;
        referralMultiplier = 1 - discountPct / 100;
      }
    }

    const expectedFeeEth = expectedFee * referralMultiplier; // baseFee * (1 - discountPct/100);
    const minValueWei = parseEther(expectedFeeEth.toFixed(18));
    if (tx.value < minValueWei) {
      return NextResponse.json({ success: false, error: 'Transaction value is below the required membership fee.', code: 'INSUFFICIENT_VALUE' }, { status: 422 });
    }

    const updates: Record<string, string> = {
      status: 'active',
      paymentDate: new Date().toISOString(),
      paymentTxHash: txHash,
    };
    if (user.role === 'Tattoo Artist') {
      updates.trialEndsAt = add(new Date(), { years: 1 }).toISOString();
    }
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
        const prevWei = prevTotal.exists() ? BigInt(prevTotal.val() || '0') : BigInt("0");
        const prevAct = prevCount.exists() ? parseInt(prevCount.val() || '0', 10) : 0;
        const commissionWei = (BigInt(minValueWei) * BigInt(Math.round(commissionPct * 100))) / BigInt("10000");
        const bonusWeiPerActivation = BigInt("0"); // (por confirmar con payout), para no inventar constantes.

        const referenceUpdates: { [key: string]: any } = {};
        referenceUpdates[`users/${referrerId}/referralEarnings/${weekKey}/totalWei`] = (prevWei + commissionWei).toString();
        referenceUpdates[`users/${referrerId}/referralEarnings/${weekKey}/activatedReferrals`] = prevAct + 1;
        referenceUpdates[`users/${referrerId}/referralEarnings/${weekKey}/lastActivationAt`] = new Date().toISOString();
        referenceUpdates[`users/${referrerId}/referralEarnings/${weekKey}/weekStart`] = new Date().toISOString();
        referenceUpdates[`users/${referrerId}/referralEarnings/${weekKey}/weekEnd`] = new Date().toISOString();
        referenceUpdates[`users/${referrerId}/referralEarnings/${weekKey}/status`] = 'open';
        await db.ref().update(referenceUpdates);
      }
    }

    return NextResponse.json({ success: true, txHash });
  })().catch((error: unknown) => {
    console.error('verify-payment error:', error);
    const message = error instanceof Error ? error.message : 'Payment verification failed.';
    return NextResponse.json({ success: false, error: message, code: 'SERVER_ERROR' }, { status: 500 });
  });
}
