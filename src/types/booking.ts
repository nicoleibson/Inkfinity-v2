// src/types/booking.ts
export type BookingStatus = 'pending' | 'awaiting_payment' | 'confirmed' | 'cancelled' | 'completed';

export interface Booking {
  id: string;
  artistId: string;
  artistName: string;
  artistAvatarUrl?: string;
  artistWalletAddress?: string; // Added for payments
  clientId: string;
  clientName: string;
  clientEmail?: string;
  clientAvatarUrl?: string;
  clientWalletAddress?: string;
  bookingDate: string; // ISO string
  status: BookingStatus;
  createdAt: string; // ISO string
  description: string;
  depositAmount?: number; // In USD
  paymentTxHash?: string; // To store transaction hash
  cancellationTxHash?: string; // To store refund transaction hash
  clientAttended?: boolean;
  artistAttended?: boolean;
  clientReviewed?: boolean;
  artistReviewed?: boolean;
}
