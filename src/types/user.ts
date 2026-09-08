// src/types/user.ts
import type { Review } from './review';
import type { Referral } from './referral';

export interface Notification {
    id: string;
    type: 'follow' | 'like' | 'sale' | 'booking' | 'studio_invite' | 'comment' | 'review' | 'chat_message' | 'referral_credit';
    fromUserId: string;
    fromUserName: string;
    message: string;
    isRead: boolean;
    createdAt: any; // ServerTimestamp
    link?: string;
    inviteId?: string; // For studio invites
}

export interface StudioInvite {
    fromStudioId: string;
    fromStudioName: string;
    status: 'pending' | 'accepted' | 'rejected';
}

export interface Comment {
    id: string;
    userId: string;
    userName: string;
    userAvatar: string;
    text: string;
    createdAt: any; // ServerTimestamp
}

export interface UserProfile {
    uid: string;
    name: string;
    username: string;
    email: string;
    role: 'Client' | 'Tattoo Artist' | 'Studio' | 'Supply Store' | 'Administrator' | 'Super-Administrator';
    status: 'pending_verification' | 'pending_payment' | 'active' | 'suspended';
    bio: string;
    avatarUrl: string;
    backgroundUrl?: string;
    links?: { [key: string]: string };
    locationName?: string;
    location?: { lat: number; lng: number } | null;
    walletAddress?: string;
    points: number;
    followersCount: number;
    followingCount: number;
    artworksCount: number;
    collectionCount: number;
    likedArtworks?: { [key: string]: boolean };
    storageUsed?: number;
    followersList?: { [key: string]: boolean };
    followingList?: { [key: string]: boolean };
    isPrivate?: boolean;
    twoFactorEnabled?: boolean;
    facialScanUrl?: string | null;
    facialDescriptor?: number[] | null;
    facialAttempts?: { failed: number; lockedUntil: number | null } | null;
    artistRequestStatus?: 'none' | 'pending' | 'approved' | 'rejected';
    trialEndsAt?: string | null;
    'my-bookings'?: { [key: string]: boolean };
    bookings?: { [key: string]: boolean };
    notifications?: { [key: string]: Notification };
    lastNotificationCheck?: any;
    claimedRewards?: { [key: string]: boolean };
    chats?: { [key: string]: boolean }; // chatId: true
    // Studio-Artist relationship
    studioId?: string | null;
    studioName?: string | null;
    studioInvites?: { [inviteId: string]: StudioInvite };
    residentArtists?: { [artistId: string]: boolean };
    // Reviews
    rating?: number;
    reviewCount?: number;
    // Artist-specific settings
    allowsArtistBookings?: boolean;
    bookingDeposit?: number;
    availability?: { [date: string]: boolean }; // YYYY-MM-DD: true (unavailable)
    // Referrals
    referredBy?: string; // UID of the admin who referred this user
    referralCodeUsed?: boolean; // True if they've ever used a referral code
    referral?: Referral; // Added for enriching user data for admin view
    paymentDate?: string; // ISO string of when payment was made
    // Legal
    legal?: {
        globalTerms: boolean;
        acceptedAt: string;
    };
    creationTime?: string;
}
