import 'server-only';

import { JsonRpcProvider, keccak256 } from 'ethers';
import {
  readUserOperationEvent,
  recomputeUserOpHash,
  type UserOperationEventMatch,
} from '@/lib/userop-encoding';

/**
 * Server-side verification of World App (ERC-4337) user operations.
 *
 * Why this module exists: `MiniKit.sendTransaction` returns a `userOpHash`, not a
 * conventional `txHash`. The transaction that settles it targets the ERC-4337
 * **EntryPoint** with `value = 0`, so inspecting `tx.to` / `tx.value` of the top-level
 * transaction says nothing about what the user actually paid (the previous
 * implementation did exactly that, which would have rejected every World App payment
 * or, worse, accepted an unrelated transfer). This module instead verifies the payment
 * from independent on-chain facts:
 *
 *   1. `UserOperationEvent` emitted by the EntryPoint inside the settling transaction.
 *      Binds the claimed `userOpHash` to a real, **successful** op and yields `sender`.
 *      The EntryPoint is detected from the log, so any version (0.6 / 0.7) works.
 *   2. The **exact** recipient and amount when a bundler RPC is configured
 *      (`eth_getUserOperationByHash`), bound to the claimed hash by recomputing the
 *      ERC-4337 `userOpHash` locally, so a bundler that lies about `to`/`value` is
 *      detected.
 *   3. A **balance-delta floor** on the treasury across the settling block when no
 *      bundler is configured: proves the treasury received at least the required
 *      amount in that block.
 *
 * Every path fails closed: if the payment cannot be proven, it is rejected and the
 * caller must not grant anything.
 */

const MINIKIT_USEROP_URL = 'https://developer.world.org/api/v2/minikit/userop/';

export type UserOpTerminalStatus = 'success' | 'failed';

export type UserOpSuccessResolution = {
  transactionHash: string;
  /** From UserOperationEvent (authoritative, on-chain). */
  sender: string | null;
  /** EntryPoint that executed the op, taken from the emitting log address. */
  entryPoint: string | null;
  /** Only present when a bundler proved the exact transfer. */
  to: string | null;
  valueWei: bigint | null;
  /** True when `to`/`value` were proven exactly by the bundler. */
  exactRecipientVerified: boolean;
};

export type UserOpFailureCode =
  | 'USEROP_LOOKUP_FAILED'
  | 'USEROP_PENDING'
  | 'USEROP_FAILED'
  | 'USEROP_NOT_IN_TX'
  | 'USEROP_REVERTED'
  | 'WRONG_RECIPIENT'
  | 'INSUFFICIENT_VALUE'
  | 'USEROP_UNVERIFIABLE';

export type UserOpVerification =
  | { ok: true; resolution: UserOpSuccessResolution }
  | { ok: false; status: number; code: UserOpFailureCode; error: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTxHash(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}

type PortalStatus = {
  status: string;
  transaction_hash: string | null;
  sender: string | null;
};

async function fetchUserOpStatus(userOpHash: string): Promise<PortalStatus> {
  const res = await fetch(`${MINIKIT_USEROP_URL}${userOpHash}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Developer Portal returned HTTP ${res.status}`);
  }
  const json = await res.json();
  return {
    status: typeof json?.status === 'string' ? json.status : 'pending',
    transaction_hash: isTxHash(json?.transaction_hash) ? json.transaction_hash : null,
    sender: typeof json?.sender === 'string' ? json.sender : null,
  };
}

/**
 * Polls the Developer Portal until the userOp reaches a terminal state.
 * Bounded by `timeoutMs` so a stuck userOp cannot pin a serverless invocation.
 * A transient portal failure is retried rather than read as a failure.
 */
export async function pollUserOpUntilTerminal(
  userOpHash: string,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<UserOpTerminalStatus | 'timeout'> {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const intervalMs = options.intervalMs ?? 3_000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      const data = await fetchUserOpStatus(userOpHash);
      if (data.status === 'success' || data.transaction_hash) return 'success';
      if (data.status === 'failed') return 'failed';
    } catch {
      if (Date.now() >= deadline) return 'timeout';
      await sleep(intervalMs);
      continue;
    }

    if (Date.now() >= deadline) return 'timeout';
    await sleep(intervalMs);
  }
}

type BundlerUserOp = {
  sender: string;
  nonce: bigint;
  initCode: string;
  callData: string;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: string;
  to: string | null;
  value: bigint;
};

async function fetchUserOpFromBundler(
  bundlerUrl: string,
  userOpHash: string,
): Promise<BundlerUserOp | null> {
  let op: Record<string, string>;
  try {
    const res = await fetch(bundlerUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getUserOperationByHash',
        params: [userOpHash],
      }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: Record<string, string> | null };
    if (!json?.result || typeof json.result !== 'object') return null;
    op = json.result;
  } catch {
    return null;
  }

  const asBigInt = (key: string, fallback = BigInt(0)) => {
    const value = op[key];
    if (typeof value !== 'string') return fallback;
    try {
      return BigInt(value);
    } catch {
      return fallback;
    }
  };

  return {
    sender: typeof op.sender === 'string' ? op.sender : '',
    nonce: asBigInt('nonce'),
    initCode: typeof op.initCode === 'string' ? op.initCode : '0x',
    callData: typeof op.callData === 'string' ? op.callData : '0x',
    callGasLimit: asBigInt('callGasLimit'),
    verificationGasLimit: asBigInt('verificationGasLimit'),
    preVerificationGas: asBigInt('preVerificationGas'),
    maxFeePerGas: asBigInt('maxFeePerGas'),
    maxPriorityFeePerGas: asBigInt('maxPriorityFeePerGas'),
    paymasterAndData: typeof op.paymasterAndData === 'string' ? op.paymasterAndData : '0x',
    to: typeof op.to === 'string' ? op.to : null,
    value: asBigInt('value'),
  };
}

function sameAddress(a: string | null | undefined, b: string): boolean {
  return typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
}

/**
 * Full verification of a World App payment.
 *
 * @param expectedTo   Treasury address that must have received the funds.
 * @param minValueWei  Minimum amount that must have been transferred.
 * @param bundlerUrl   Optional bundler RPC enabling exact `to`/`value` proof.
 */
export async function verifyUserOpPayment(params: {
  provider: JsonRpcProvider;
  userOpHash: string;
  transactionHash: string;
  expectedTo: string;
  minValueWei: bigint;
  bundlerUrl?: string;
  treasuryAddress?: string;
  poll?: { timeoutMs?: number; intervalMs?: number };
}): Promise<UserOpVerification> {
  const { provider, userOpHash, transactionHash, expectedTo, minValueWei } = params;

  if (!isTxHash(userOpHash) || !isTxHash(transactionHash)) {
    return {
      ok: false,
      status: 400,
      code: 'USEROP_LOOKUP_FAILED',
      error: 'Malformed userOp or transaction hash.',
    };
  }

  const receipt = await provider.getTransactionReceipt(transactionHash);
  if (!receipt) {
    return {
      ok: false,
      status: 202,
      code: 'USEROP_PENDING',
      error: 'The settling transaction is not mined yet.',
    };
  }
  if (receipt.status !== 1) {
    return {
      ok: false,
      status: 422,
      code: 'USEROP_REVERTED',
      error: 'The settling transaction reverted on-chain.',
    };
  }

  // (1) Authoritative on-chain binding: the op exists, succeeded, and its sender.
  const match: UserOperationEventMatch | null = readUserOperationEvent(receipt, userOpHash);
  if (!match) {
    return {
      ok: false,
      status: 422,
      code: 'USEROP_NOT_IN_TX',
      error: 'The referenced user operation is not present in the settling transaction.',
    };
  }
  if (!match.event.success) {
    return {
      ok: false,
      status: 422,
      code: 'USEROP_FAILED',
      error: 'The user operation failed on-chain.',
    };
  }

  const sender = match.event.sender;

  let to: string | null = null;
  let valueWei: bigint | null = null;
  let exactRecipientVerified = false;

  // (2) Exact recipient/amount via bundler, bound to the claimed hash.
  if (params.bundlerUrl) {
    const op = await fetchUserOpFromBundler(params.bundlerUrl, userOpHash);
    if (!op) {
      return {
        ok: false,
        status: 502,
        code: 'USEROP_UNVERIFIABLE',
        error: 'The configured bundler RPC could not return the user operation.',
      };
    }

    const recomputed = recomputeUserOpHash({ entryPoint: match.entryPoint, ...op });
    if (!recomputed || recomputed.toLowerCase() !== userOpHash.toLowerCase()) {
      return {
        ok: false,
        status: 422,
        code: 'USEROP_UNVERIFIABLE',
        error: 'The user operation reported by the bundler does not match the claimed hash.',
      };
    }
    if (!sameAddress(op.sender, sender)) {
      return {
        ok: false,
        status: 422,
        code: 'USEROP_UNVERIFIABLE',
        error: 'The user operation sender does not match the on-chain event.',
      };
    }

    to = op.to;
    valueWei = op.value;
    exactRecipientVerified = true;
  }

  // (3) Recipient/amount assertions.
  if (exactRecipientVerified) {
    if (!sameAddress(to, expectedTo)) {
      return {
        ok: false,
        status: 422,
        code: 'WRONG_RECIPIENT',
        error: 'The user operation paid an address other than the platform treasury.',
      };
    }
    if ((valueWei as bigint) < minValueWei) {
      return {
        ok: false,
        status: 422,
        code: 'INSUFFICIENT_VALUE',
        error: 'The user operation transferred less than the required amount.',
      };
    }
  } else {
    // No bundler configured: require the treasury to have received at least the fee
    // within the settling block. Conservative, but it cannot be satisfied without the
    // funds actually arriving.
    const treasury = params.treasuryAddress || expectedTo;
    const blockNumber = receipt.blockNumber;

    const [before, after] = await Promise.all([
      provider.getBalance(treasury, blockNumber - 1),
      provider.getBalance(treasury, blockNumber),
    ]);

    if (after - before < minValueWei) {
      return {
        ok: false,
        status: 422,
        code: 'INSUFFICIENT_VALUE',
        error:
          'The recipient did not receive the required amount in the settling block. Configure RPC_WORLDCHAIN_BUNDLER_URL to verify user operations exactly.',
      };
    }
  }

  return {
    ok: true,
    resolution: {
      transactionHash,
      sender,
      entryPoint: match.entryPoint,
      to,
      valueWei,
      exactRecipientVerified,
    },
  };
}

/**
 * Resolves a `userOpHash` to its settling transaction hash, polling the Developer
 * Portal. Returns 'pending' / 'failed' / 'timeout' instead of throwing for the
 * expected non-terminal states.
 */
export async function resolveUserOpTransactionHash(
  userOpHash: string,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<
  | { state: 'success'; transactionHash: string; portalSender: string | null }
  | { state: 'pending' }
  | { state: 'failed'; detail: string }
  | { state: 'unavailable' }
> {
  const deadline = Date.now() + (options.timeoutMs ?? 45_000);
  const intervalMs = options.intervalMs ?? 3_000;
  let sawData = false;

  for (;;) {
    try {
      const data = await fetchUserOpStatus(userOpHash);
      sawData = true;
      if (data.transaction_hash) {
        return { state: 'success', transactionHash: data.transaction_hash, portalSender: data.sender };
      }
      if (data.status === 'failed') {
        return { state: 'failed', detail: 'The user operation reverted on-chain.' };
      }
    } catch {
      // Retry transient portal/network errors until the deadline.
    }

    if (Date.now() >= deadline) {
      return sawData ? { state: 'pending' } : { state: 'unavailable' };
    }
    await sleep(intervalMs);
  }
}
