// src/app/api/referral-payouts/on-chain/route.ts
// Executes referral commission payouts on-chain via World Chain.
// Sends WLD (ERC-20) from the platform wallet to the referrer's wallet.
// Only Super-Administrators can trigger this.

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { JsonRpcProvider, Wallet, Contract, formatEther } from 'ethers';
import { getWorldChainRpcUrl } from '@/lib/worldchain-rpc';

export const runtime = 'nodejs';
export const maxDuration = 60;

const WEEK_KEY_RE = /^\d{4}-W\d{2}$/;

// WLD Token on World Chain Mainnet
const WLD_CONTRACT = '0x2cFc85d8E48F8EAB294be644d9E25C3030863003';
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];

function getRpcUrl(): string {
  return getWorldChainRpcUrl();
}

export async function POST(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const adminUid = (body?.adminUid || '').toString().trim();
  const referrerId = (body?.referrerId || '').toString().trim();
  const weekKey = (body?.weekKey || '').toString().trim();

  if (!adminUid || !referrerId || !weekKey || !WEEK_KEY_RE.test(weekKey)) {
    return NextResponse.json(
      { success: false, error: 'adminUid, referrerId and weekKey (YYYY-Www) are required.' },
      { status: 400 },
    );
  }

  const db = getAdminDb();

  // --- Auth: Only Super-Administrator ---
  const adminSnap = await db.ref(`users/${adminUid}`).get();
  if (!adminSnap.exists() || adminSnap.val()?.role !== 'Super-Administrator') {
    return NextResponse.json(
      { success: false, error: 'Only a Super-Administrator can execute on-chain payouts.' },
      { status: 403 },
    );
  }

  // --- Read earnings ---
  const earningsRef = db.ref(`users/${referrerId}/referralEarnings/${weekKey}`);
  const earningsSnap = await earningsRef.get();
  if (!earningsSnap.exists()) {
    return NextResponse.json(
      { success: false, error: 'No weekly referral earnings found for that referrer/weekKey.' },
      { status: 404 },
    );
  }
  const earnings = earningsSnap.val();

  if (earnings.status === 'paid') {
    return NextResponse.json(
      { success: false, error: 'This week has already been paid out.' },
      { status: 409 },
    );
  }

  const totalWei = BigInt(String(earnings.totalWei || '0'));
  if (totalWei <= BigInt(0)) {
    return NextResponse.json(
      { success: false, error: 'No earnings to pay out (totalWei is zero).' },
      { status: 400 },
    );
  }

  // --- Read referrer's wallet ---
  const referrerSnap = await db.ref(`users/${referrerId}`).get();
  if (!referrerSnap.exists()) {
    return NextResponse.json(
      { success: false, error: 'Referrer user not found.' },
      { status: 404 },
    );
  }
  const referrer = referrerSnap.val();
  const toAddress = (referrer.walletAddress || '').toString().trim();

  if (!toAddress || !/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
    // Mark as wallet required so it can be retried later
    await earningsRef.update({ status: 'walletRequired' });
    return NextResponse.json(
      { success: false, error: 'Referrer does not have a valid wallet address. Status set to walletRequired.', code: 'WALLET_REQUIRED' },
      { status: 400 },
    );
  }

  // --- Prepare transaction ---
  const privateKey = process.env.PLATFORM_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    return NextResponse.json(
      { success: false, error: 'PLATFORM_WALLET_PRIVATE_KEY is not configured on the server.' },
      { status: 500 },
    );
  }

  const rpcUrl = getRpcUrl();
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const wldContract = new Contract(WLD_CONTRACT, ERC20_ABI, wallet);

  // Check balance
  const balance = await wldContract.balanceOf(wallet.address);
  if (BigInt(balance) < totalWei) {
    return NextResponse.json(
      {
        success: false,
        error: `Insufficient WLD balance. Need ${formatEther(totalWei)} WLD, have ${formatEther(balance)} WLD.`,
        code: 'INSUFFICIENT_BALANCE',
      },
      { status: 400 },
    );
  }

  // Mark as processing to prevent double-spend
  await earningsRef.update({ status: 'payoutProcessing' });

  try {
    // Send WLD ERC-20 transfer
    const tx = await wldContract.transfer(toAddress, totalWei);
    const receipt = await tx.wait(1); // Wait for 1 confirmation

    const nowIso = new Date().toISOString();
    const txHash = receipt.hash;

    // Atomic update: mark as paid
    const updates: Record<string, any> = {
      [`users/${referrerId}/referralEarnings/${weekKey}/status`]: 'paid',
      [`users/${referrerId}/referralPayouts/${weekKey}`]: {
        weekKey,
        status: 'paid',
        amountWei: totalWei.toString(),
        amountWld: formatEther(totalWei),
        activatedReferrals: earnings.activatedReferrals || 0,
        onChain: {
          txHash,
          chain: 'worldchain',
          from: wallet.address,
          to: toAddress,
          token: 'WLD',
          confirmedAt: nowIso,
        },
        paidBy: adminUid,
        paidAt: nowIso,
        timeline: [
          {
            at: nowIso,
            action: 'paidOnChain',
            by: adminUid,
            detail: `On-chain WLD transfer: ${formatEther(totalWei)} WLD to ${toAddress} (tx: ${txHash})`,
          },
        ],
      },
    };

    await db.ref().update(updates);

    return NextResponse.json({
      success: true,
      payoutStatus: 'paid',
      weekKey,
      amountWld: formatEther(totalWei),
      txHash,
      explorerUrl: `https://worldscan.org/tx/${txHash}`,
    });
  } catch (error: any) {
    // Mark as failed so it can be retried
    await earningsRef.update({ status: 'payoutFailed' });

    console.error('On-chain payout failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: `Transaction failed: ${error.message || 'Unknown error'}`,
        code: 'TX_FAILED',
      },
      { status: 500 },
    );
  }
}
