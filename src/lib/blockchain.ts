// src/lib/blockchain.ts

/**
 * Single source of truth for supported networks. Derive types, zod enums and
 * UI pickers from this so a new network can't be added to one place and
 * forgotten in another.
 */
export const NETWORK_NAMES = ['amoy', 'polygon', 'worldchain', 'worldchainSepolia'] as const;

export type NetworkName = (typeof NETWORK_NAMES)[number];

/**
 * Network used when none is specified. Mirrors the fallback in
 * `usePlatformSettings`: production settles on WorldChain (WLD).
 */
export const DEFAULT_NETWORK: NetworkName = 'worldchain';

/**
 * Human-facing symbol for each supported network's native asset.
 * WorldChain settles in WLD (native gas+value token); Polygon/Amoy use MATIC.
 */
export const NETWORK_TOKEN_SYMBOL: Record<NetworkName, string> = {
  amoy: 'MATIC',
  polygon: 'MATIC',
  worldchain: 'WLD',
  worldchainSepolia: 'WLD',
};

export const EXPLORER_TOKEN_URL: Record<NetworkName, string> = {
  amoy: 'https://amoy.polygonscan.com/token',
  polygon: 'https://polygonscan.com/token',
  worldchain: 'https://worldscan.org/token', // WorldChain explorer (token+tokenId via ?a=)
  worldchainSepolia: 'https://sepolia.worldscan.org/token', // WorldChain Sepolia explorer (token+tokenId via ?a=)
};

/**
 * Builds a block-explorer URL that points directly at a specific token
 * (contract + tokenId) so a user can inspect the asset on-chain.
 */
export function getTokenExplorerUrl(
  network: NetworkName | null | undefined,
  contractAddress: string | null | undefined,
  tokenId: string | null | undefined
): string | null {
  if (!network || !contractAddress || !tokenId) return null;
  const base = EXPLORER_TOKEN_URL[network];
  if (!base) return null;
  return `${base}/${contractAddress}?a=${tokenId}`;
}

/**
 * Resolves a human-friendly gateway URL for a CID.
 *
 * Content is persisted in the project's Cloud Storage bucket (no longer
 * pinned to the public IPFS network), so the only gateway that can serve it
 * is the app itself (in-memory cache, falling back to a Cloud Storage read).
 */
export function getIpfsGatewayUrl(cid: string | null | undefined): string | null {
  if (!cid) return null;
  return `/api/ipfs?cid=${cid}`;
}
