// src/lib/nft-verification.ts
import { JsonRpcProvider, Contract, isAddress, getAddress } from 'ethers';
import { DEFAULT_NETWORK, type NetworkName } from './blockchain';

/**
 * Real, on-chain NFT ownership verification.
 *
 * Reads the token contract directly via an RPC endpoint and answers whether
 * the given wallet owns the given token. Supports both ERC-721 (ownerOf) and
 * ERC-1155 (balanceOf) standards.
 *
 * RPC endpoints can be overridden via env vars (recommended for production to
 * avoid public rate limits):
 *  - RPC_AMOY_URL
 *  - RPC_POLYGON_URL
 *  - RPC_WORLDCHAIN_URL
 *  - RPC_WORLDCHAIN_SEPOLIA_URL
 */
const RPC_URLS: Record<NetworkName, string | undefined> = {
  amoy: process.env.RPC_AMOY_URL || 'https://rpc-amoy.polygon.technology/',
  polygon: process.env.RPC_POLYGON_URL || 'https://polygon-rpc.com/',
  worldchain: process.env.RPC_WORLDCHAIN_URL || 'https://worldchain-mainnet.g.alchemy.com/public',
  worldchainSepolia: process.env.RPC_WORLDCHAIN_SEPOLIA_URL || 'https://worldchain-sepolia.g.alchemy.com/public',
};

const ERC721_ABI = ['function ownerOf(uint256 tokenId) view returns (address)'];
const ERC1155_ABI = [
  'function balanceOf(address owner, uint256 id) view returns (uint256)',
];

const providerCache = new Map<string, JsonRpcProvider>();

function getProvider(network: NetworkName): JsonRpcProvider {
  const url = RPC_URLS[network];
  if (!url) {
    throw new Error(`No RPC endpoint configured for network "${network}".`);
  }
  let provider = providerCache.get(url);
  if (!provider) {
    provider = new JsonRpcProvider(url);
    providerCache.set(url, provider);
  }
  return provider;
}

export interface VerifyOwnershipInput {
  walletAddress: string;
  tokenId: string;
  contractAddress: string;
  network?: NetworkName;
}

export interface VerifyOwnershipResult {
  isOwner: boolean;
  reason: string;
  standard?: 'erc721' | 'erc1155';
  onChainOwner?: string;
}

/**
 * Verifies ownership of an NFT by querying the contract on-chain.
 * Never throws: failures are reported as `isOwner: false` with a reason.
 */
export async function verifyOwnershipOnChain({
  walletAddress,
  tokenId,
  contractAddress,
  network = DEFAULT_NETWORK,
}: VerifyOwnershipInput): Promise<VerifyOwnershipResult> {
  if (!isAddress(walletAddress)) {
    return { isOwner: false, reason: 'The provided wallet address is not a valid address.' };
  }
  if (!isAddress(contractAddress)) {
    return { isOwner: false, reason: 'The provided contract address is not a valid address.' };
  }
  if (!/^\d+$/.test(tokenId)) {
    return { isOwner: false, reason: 'Token ID must be a whole number.' };
  }

  const provider = getProvider(network);

  // The contract must actually be deployed on this network.
  const code = await provider.getCode(contractAddress);
  if (!code || code === '0x') {
    return {
      isOwner: false,
      reason: `No contract is deployed at ${contractAddress} on the ${network} network.`,
    };
  }

  const targetWallet = getAddress(walletAddress);
  const erc721 = new Contract(contractAddress, ERC721_ABI, provider);
  const erc1155 = new Contract(contractAddress, ERC1155_ABI, provider);

  // 1) Try ERC-721 `ownerOf`.
  try {
    const owner: string = await erc721.ownerOf(tokenId);
    const ownerAddress = getAddress(owner);
    if (ownerAddress === targetWallet) {
      return {
        isOwner: true,
        reason: 'Verified on-chain: this wallet is the ERC-721 owner of the token.',
        standard: 'erc721',
        onChainOwner: ownerAddress,
      };
    }
    return {
      isOwner: false,
      reason: 'The token exists on-chain but is owned by a different wallet.',
      standard: 'erc721',
      onChainOwner: ownerAddress,
    };
  } catch {
    // ownerOf reverted or doesn't exist on this contract; fall through to ERC-1155.
  }

  // 2) Try ERC-1155 `balanceOf`.
  try {
    const balance: bigint = await erc1155.balanceOf(targetWallet, tokenId);
    if (balance > BigInt(0)) {
      return {
        isOwner: true,
        reason: 'Verified on-chain: this wallet holds the ERC-1155 token.',
        standard: 'erc1155',
        onChainOwner: targetWallet,
      };
    }
    return {
      isOwner: false,
      reason: 'The contract exists but this wallet holds none of this token.',
      standard: 'erc1155',
      onChainOwner: targetWallet,
    };
  } catch (error: any) {
    return {
      isOwner: false,
      reason:
        error?.reason ||
        error?.message ||
        'Could not read ownership from the contract (unsupported standard or RPC error).',
    };
  }
}
