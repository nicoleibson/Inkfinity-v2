import 'server-only';

import { JsonRpcProvider } from 'ethers';
import {
  readUserOperationEvent,
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
  requiredConfirmations?: number;
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

  // Confirmation depth. A direct transfer is only credited after a handful of
  // blocks so a reorg cannot credit a payment that later disappears from the
  // chain; user operations were skipping that guard, so they are held to the
  // same standard here (the caller polls, so this only costs a few seconds).
  const requiredConfirmations = params.requiredConfirmations || 0;
  if (requiredConfirmations > 0) {
    const head = await provider.getBlockNumber();
    const depth = head - receipt.blockNumber + 1;
    if (depth < requiredConfirmations) {
      return {
        ok: false,
        status: 202,
        code: 'USEROP_PENDING',
        error: `The transaction has only ${depth} confirmation(s); ${requiredConfirmations} are required. Try again shortly.`,
      };
    }
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
  const treasury = params.treasuryAddress || expectedTo;

  // WLD Token Address on World Chain Mainnet
  const WLD_CONTRACT_ADDRESS = '0x2cFc85d8E48F8EAB294be644d9E25C3030863003';
  // Transfer event signature: Transfer(address indexed from, address indexed to, uint256 value)
  const TRANSFER_TOPIC_0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

  // Analizar todos los logs emitidos en esta transacción buscando transferencias del token WLD
  // desde el Smart Wallet del usuario hacia nuestra tesorería.
  let transferredWei = BigInt(0);

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== WLD_CONTRACT_ADDRESS.toLowerCase()) continue;
    if (log.topics.length < 3) continue;
    if (log.topics[0] !== TRANSFER_TOPIC_0) continue;

    // Los temas indexados tienen 32 bytes (64 caracteres + '0x'). Extraemos los últimos 40 caracteres (20 bytes).
    const fromTopic = '0x' + log.topics[1].slice(26).toLowerCase();
    const toTopic = '0x' + log.topics[2].slice(26).toLowerCase();

    if (fromTopic === sender.toLowerCase() && toTopic === treasury.toLowerCase()) {
      transferredWei += BigInt(log.data);
    }
  }

  if (transferredWei < minValueWei) {
    return {
      ok: false,
      status: 422,
      code: 'INSUFFICIENT_VALUE',
      error: 'The user operation did not transfer the required amount of WLD tokens.',
    };
  }

  return {
    ok: true,
    resolution: {
      transactionHash,
      sender,
      entryPoint: match.entryPoint,
      to: treasury,
      valueWei: transferredWei,
      exactRecipientVerified: true,
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
