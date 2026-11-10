// src/types/referral.ts

export interface Referral {
    code: string;
    referrerId: string; // Owner's UID (admin, artist, studio, store, or client)
    adminName: string; // Keep for backward compatibility
    ownerName: string; // Generic name for the referral owner
    ownerRole: string; // e.g. 'Administrator', 'Tattoo Artist', 'Studio', 'Supply Store', 'Client'
    discountPercentage: number;
    commissionPercentage: number;
    createdAt: any; // ServerTimestamp
    uses: number;
}

