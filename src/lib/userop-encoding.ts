import { keccak256, toUtf8Bytes, AbiCoder } from 'ethers';

/**
 * Pure (network-free) encoding helpers for ERC-4337 user operations.
 *
 * Kept separate from `lib/server/userop-verification.ts` so the on-chain parsing
 * can be exercised without a server runtime.
 */

/** keccak256("UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)") */
export const USER_OPERATION_EVENT_TOPIC = keccak256(
  toUtf8Bytes('UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)'),
);

const abiCoder = AbiCoder.defaultAbiCoder();

export type UserOperationEventArgs = {
  sender: string;
  nonce: bigint;
  success: boolean;
};

export type UserOperationEventMatch = {
  entryPoint: string;
  event: UserOperationEventArgs;
};

/**
 * Finds the `UserOperationEvent` for `userOpHash` inside a settled transaction receipt.
 * The EntryPoint address is read from the emitting log, so no version-specific
 * address needs to be hardcoded (works with 0.6 and 0.7 EntryPoints).
 */
export function readUserOperationEvent(
  receipt: { logs: readonly { address: string; topics: readonly string[]; data: string }[] },
  userOpHash: string,
): UserOperationEventMatch | null {
  const wanted = userOpHash.toLowerCase();

  for (const log of receipt.logs) {
    if (log.topics[0]?.toLowerCase() !== USER_OPERATION_EVENT_TOPIC) continue;
    // topics: [signature, userOpHash (indexed), sender (indexed), paymaster (indexed)]
    if (log.topics[1]?.toLowerCase() !== wanted) continue;

    // data: (uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)
    const [nonce, success] = abiCoder.decode(
      ['uint256', 'bool', 'uint256', 'uint256'],
      log.data,
    ) as unknown as [bigint, boolean, bigint, bigint];

    return {
      entryPoint: log.address,
      event: { sender: log.topics[2], nonce, success },
    };
  }

  return null;
}

/**
 * Recomputes the ERC-4337 userOpHash so a bundler response can be bound to the hash the
 * client claimed. Returns null when the response lacks fields required to compute it
 * (some bundler versions omit `paymaster` / `paymasterAndData`).
 */
export function recomputeUserOpHash(params: {
  entryPoint: string;
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
}): string | null {
  if (!params.sender || params.sender === '0x') return null;
  if (!params.paymasterAndData) return null;

  return keccak256(
    abiCoder.encode(
      [
        'address',
        'address',
        'uint256',
        'bytes32',
        'bytes32',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'bytes32',
      ],
      [
        params.entryPoint,
        params.sender,
        params.nonce,
        keccak256(params.initCode),
        keccak256(params.callData),
        params.callGasLimit,
        params.verificationGasLimit,
        params.preVerificationGas,
        params.maxFeePerGas,
        params.maxPriorityFeePerGas,
        keccak256(params.paymasterAndData),
      ],
    ),
  );
}
