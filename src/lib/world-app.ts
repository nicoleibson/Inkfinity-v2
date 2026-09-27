'use client';

import { MiniKit, getWorldAppProvider } from '@worldcoin/minikit-js';
import type { SendTransactionResult } from '@worldcoin/minikit-js/commands';

export const WORLD_CHAIN_ID = 480;

/**
 * True only when running inside the World App (native webview).
 */
export function isInWorldApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.WorldApp) && MiniKit.isInWorldApp();
}

let installAttempted = false;

/**
 * Binds MiniKit to the World App bridge. Safe to call on any page load;
 * no-ops outside World App and never throws.
 */
export function ensureMiniKitInstalled(): void {
  if (installAttempted || typeof window === 'undefined') return;
  installAttempted = true;
  if (!window.WorldApp) return;
  const appId = process.env.NEXT_PUBLIC_WORLD_APP_ID || '';
  MiniKit.install(appId || undefined);
}

/**
 * EIP-1193 provider exposed by World App (SIWE on eth_requestAccounts,
 * userOps on eth_sendTransaction). Returns null outside World App.
 */
export function getWorldAppProviderOrNull() {
  if (!isInWorldApp()) return null;
  return getWorldAppProvider();
}

/**
 * Pays the recipient `to` a native amount (WLD on World Chain) via the World
 * App bridge. Only valid inside World App.
 */
export async function sendWorldAppTransaction(params: {
  to: string;
  valueWei: bigint;
}): Promise<SendTransactionResult> {
  const result = await MiniKit.sendTransaction({
    chainId: WORLD_CHAIN_ID,
    transactions: [
      {
        to: params.to as `0x${string}`,
        value: `0x${params.valueWei.toString(16)}`,
      },
    ],
  });
  if (result.executedWith !== 'minikit') {
    throw new Error('World App transaction could not be executed.');
  }
  return result.data;
}

/**
 * Resolves the status of a World App user operation on the server.
 * The Developer Portal returns the final on-chain `transaction_hash` once the
 * userOp is mined (success) — or `null` while pending.
 */
export const MINIKIT_USEROP_URL =
  'https://developer.world.org/api/v2/minikit/userop/';

export async function resolveUserOp(userOpHash: string): Promise<{
  status: 'pending' | 'success' | 'failed';
  transaction_hash: string | null;
  sender: string | null;
}> {
  const res = await fetch(`${MINIKIT_USEROP_URL}${userOpHash}`);
  if (!res.ok) {
    throw new Error(`Failed to resolve user operation: HTTP ${res.status}`);
  }
  const json = await res.json();
  return {
    status: json?.status ?? 'pending',
    transaction_hash: json?.transaction_hash ?? null,
    sender: json?.sender ?? null,
  };
}