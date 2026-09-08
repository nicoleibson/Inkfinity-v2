// src/types/referral.ts

export interface Referral {
    code: string;
    referrerId: string; // Admin's UID
    adminName: string; // Admin's name
    discountPercentage: number;
    commissionPercentage: number;
    createdAt: any; // ServerTimestamp
    uses: number;
}
