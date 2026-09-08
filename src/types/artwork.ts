// src/types/artwork.ts

export interface SaleRecord {
  price: number;
  timestamp: any; // ServerTimestamp
  fromOwnerId: string;
  toOwnerId: string;
}

export interface Artwork {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  imageUrl: string;
  storagePath: string;
  fileSize?: number; // Add file size for storage management
  artistId: string;
  artistName: string;
  artistUsername: string;
  artistAvatarUrl?: string; // Added for displaying on cards
  ownerId: string;
  ownerName?: string; // name of the current owner
  buyerId?: string | null; // UID of the user who has paid but not yet received the NFT
  createdAt: string; // ISO string
  isForSale: boolean;
  price: number | null;
  likesCount?: number;
  likes?: { [key: string]: boolean };
  commentsCount?: number;
  dataAiHint?: string;
  moderationStatus?: 'pending_deletion' | 'approved' | 'awaiting_delivery'; // Added new status
  moderationReason?: string; // Reason provided by admin for deletion report
  reportedBy?: string; // UID of the admin who reported it
  location?: { lat: number; lng: number } | null;
  locationName?: string | null;
  saleHistory?: { [key: string]: SaleRecord };
  
  isPrivate?: boolean;
  
  // Web3 properties
  isDigitalAsset: boolean; // Changed to non-optional
  blockchain?: 'amoy' | 'polygon';
  contractAddress?: string;
  tokenId?: string;
  ownershipMismatch?: boolean; // True if DB owner doesn't match blockchain owner
}
