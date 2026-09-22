// src/lib/nft-sync.ts
import { database } from './firebase-config';
import { ref, get, query, orderByChild, equalTo, update } from 'firebase/database';
import { verifyNftOwnership } from '@/ai/flows/verify-nft-ownership-flow';
import type { Artwork } from '@/types/artwork';
import type { UserProfile } from '@/types/user';

/**
 * Iterates through all for-sale digital assets and verifies their ownership on the blockchain.
 * Marks assets with ownership mismatches.
 * @returns {Promise<{synced: number, mismatched: number}>} - The number of assets synced and mismatched.
 */
export async function syncAllNfts() {
  console.log("Starting NFT ownership synchronization...");
  
  const artworksRef = ref(database, 'artworks');
  // Query for artworks that are digital assets and are for sale.
  // Note: Firebase Realtime Database doesn't support compound queries on multiple fields (e.g., isDigitalAsset AND isForSale).
  // We'll fetch all 'isForSale' and filter locally. This is not ideal for massive datasets, but acceptable for this prototype.
  // In a production app, you might use a composite key like `isForSale_isDigitalAsset: true_true`.
  const forSaleQuery = query(artworksRef, orderByChild('isForSale'), equalTo(true));

  const snapshot = await get(forSaleQuery);

  if (!snapshot.exists()) {
    console.log("No for-sale artworks to sync.");
    return { synced: 0, mismatched: 0 };
  }
  
  let synced = 0;
  let mismatched = 0;
  const updates: { [key: string]: any } = {};

  const artworkPromises = Object.entries(snapshot.val()).map(async ([artworkId, artworkData]) => {
    const artwork = { id: artworkId, ...(artworkData as object) } as Artwork;

    // Additional local filter for digital assets
    if (!artwork.isDigitalAsset || !artwork.contractAddress || !artwork.tokenId) {
        return; // Skip non-digital assets or those missing blockchain info
    }

    try {
        const ownerRef = ref(database, `users/${artwork.ownerId}`);
        const ownerSnap = await get(ownerRef);

        if (!ownerSnap.exists() || !ownerSnap.val().walletAddress) {
            console.warn(`Skipping artwork ${artworkId}: Owner or owner wallet not found.`);
            return;
        }

        const ownerWallet = ownerSnap.val().walletAddress;
        
        const verification = await verifyNftOwnership({
            walletAddress: ownerWallet,
            tokenId: artwork.tokenId,
            contractAddress: artwork.contractAddress,
            network: artwork.blockchain || undefined,
        });

        synced++;

        if (!verification.isOwner) {
            mismatched++;
            updates[`/artworks/${artworkId}/ownershipMismatch`] = true;
            console.log(`Mismatch found for artwork ${artworkId}. Owner on platform: ${ownerWallet}, but verification failed.`);
        } else {
            // If it was previously mismatched, correct it.
            if (artwork.ownershipMismatch) {
                updates[`/artworks/${artworkId}/ownershipMismatch`] = null;
            }
        }
    } catch (error) {
        console.error(`Error processing artwork ${artworkId}:`, error);
    }
  });

  await Promise.all(artworkPromises);

  if (Object.keys(updates).length > 0) {
      await update(ref(database), updates);
      console.log(`Applied ${Object.keys(updates).length} updates for ownership mismatches.`);
  }

  console.log(`NFT Sync Complete. Checked: ${synced}, Mismatches found: ${mismatched}.`);
  return { synced, mismatched };
}
