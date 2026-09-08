// src/types/review.ts

export interface Review {
  id: string;
  bookingId: string;
  rating: number; // 1-5
  text: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  revieweeId: string; // The user being reviewed
  createdAt: any; // ServerTimestamp
}
