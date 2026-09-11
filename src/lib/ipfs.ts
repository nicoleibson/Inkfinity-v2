// src/lib/ipfs.ts

export interface IpfsUploadResult {
  success: boolean;
  cid: string;
  ipfsUri: string;
  gatewayUrl: string;
  fallbackGatewayUrl: string;
  localProxyUrl: string;
  pinnedExternally: boolean;
  metadataCid: string;
  metadataIpfsUri: string;
  metadata: any;
}

/**
 * Uploads an image (Data URI) to IPFS via the app's IPFS service.
 * Returns the immutable IPFS URI (ipfs://...) and public gateway URLs.
 */
export const uploadArtworkToIpfs = async (params: {
  dataUri: string;
  fileName?: string;
  title?: string;
  description?: string;
  artistName?: string;
  tags?: string[];
  contractAddress?: string;
  tokenId?: string;
}): Promise<IpfsUploadResult> => {
  const response = await fetch('/api/ipfs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Fallo al subir a IPFS.');
  }

  return response.json();
};

/**
 * Formats an IPFS URI (ipfs://...) to a browser-compatible gateway URL.
 */
export const ipfsToGatewayUrl = (uriOrUrl: string): string => {
  if (!uriOrUrl) return '';
  if (uriOrUrl.startsWith('ipfs://')) {
    const hash = uriOrUrl.replace('ipfs://', '');
    return `https://ipfs.io/ipfs/${hash}`;
  }
  return uriOrUrl;
};
