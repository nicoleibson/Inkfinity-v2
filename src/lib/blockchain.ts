// src/lib/blockchain.ts

export type NetworkName = 'amoy' | 'polygon';

export const EXPLORER_TOKEN_URL: Record<NetworkName, string> = {
  amoy: 'https://amoy.polygonscan.com/token',
  polygon: 'https://polygonscan.com/token',
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
