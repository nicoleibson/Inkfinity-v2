// src/app/collection/page.tsx
"use client";

import { useEffect, useState } from "react";
import { database, auth } from "@/lib/firebase-config";
import { ref, onValue, query, orderByChild, equalTo, get } from "firebase/database";
import ArtworkCard from "@/components/artwork-card";
import { LayoutGrid, Loader2 } from "lucide-react";
import type { Artwork } from "@/types/artwork";
import { useUserSession } from "@/hooks/useUserSession";
import { onAuthStateChanged, User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserProfile } from "@/types/user";

export default function CollectionPage() {
  const [collectedArtworks, setCollectedArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const router = useRouter();

  useUserSession();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const userRef = ref(database, `users/${user.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          setCurrentUserProfile({ uid: user.uid, ...snapshot.val() });
        } else {
           router.push('/login'); // Profile doesn't exist, something is wrong
        }
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribeAuth();
  }, [router]);

  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);
    const artworksRef = query(ref(database, 'artworks'), orderByChild('ownerId'), equalTo(currentUser.uid));
    
    const unsubscribeDb = onValue(artworksRef, (snapshot) => {
        const artworksData: Artwork[] = [];
        snapshot.forEach(childSnapshot => {
            artworksData.push({ id: childSnapshot.key!, ...childSnapshot.val() });
        });
        setCollectedArtworks(artworksData.reverse()); // Show newest first
        setLoading(false);
    }, (error) => {
        console.error("Error fetching collection: ", error);
        setLoading(false);
    });

    return () => unsubscribeDb();
  }, [currentUser]);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <LayoutGrid className="h-8 w-8 text-primary"/>
        <h1 className="text-4xl font-headline font-bold">My Collection</h1>
      </div>

       {loading ? (
        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 break-inside-avoid-column">
              <Skeleton className="h-[300px] w-full" />
            </div>
          ))}
        </div>
       ) : collectedArtworks.length > 0 ? (
        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6">
          {collectedArtworks.map((artwork) => (
            <ArtworkCard key={artwork.id} artwork={artwork} currentUserProfile={currentUserProfile} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
            <h2 className="text-2xl font-semibold text-muted-foreground">Your collection is empty.</h2>
            <p className="mt-2 text-muted-foreground">Start exploring the marketplace to find your next piece.</p>
        </div>
      )}
    </div>
  );
}
