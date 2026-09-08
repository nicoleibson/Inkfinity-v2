// src/components/search/artwork-result-card.tsx
import type { Artwork } from '@/types/artwork';
import ArtworkCard from '../artwork-card';
import type { UserProfile } from '@/types/user';

interface ArtworkResultCardProps {
  artwork: Artwork;
  currentUserProfile: UserProfile | null;
}

export function ArtworkResultCard({ artwork, currentUserProfile }: ArtworkResultCardProps) {
  return (
    <ArtworkCard artwork={artwork} currentUserProfile={currentUserProfile} />
  );
}
