// src/app/following/page.tsx
"use client";

import { useEffect, useState } from "react";
import { database, auth } from "@/lib/firebase-config";
import { ref, onValue, get } from "firebase/database";
import { ArtistResultCard } from "@/components/search/artist-result-card";
import { Users, Loader2 } from "lucide-react";
import type { UserProfile } from "@/types/user";
import { useUserSession } from "@/hooks/useUserSession";
import { onAuthStateChanged, User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function FollowingPage() {
  const [followingList, setFollowingList] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const router = useRouter();

  useUserSession(currentUserProfile);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = ref(database, `users/${user.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          const profile = { uid: user.uid, ...snapshot.val() };
          setCurrentUserProfile(profile);
          fetchFollowing(profile);
        } else {
           router.push('/login');
        }
      } else {
        router.push('/login');
      }
    });

    const fetchFollowing = async (profile: UserProfile) => {
        setLoading(true);
        if (!profile.followingList) {
            setLoading(false);
            return;
        }

        const followingIds = Object.keys(profile.followingList);
        const userPromises = followingIds.map(id => get(ref(database, `users/${id}`)));
        
        try {
            const userSnapshots = await Promise.all(userPromises);
            const usersData = userSnapshots
                .map(snap => snap.exists() ? { uid: snap.key!, ...snap.val() } as UserProfile : null)
                .filter(Boolean) as UserProfile[];
            
            setFollowingList(usersData);
        } catch (error) {
            console.error("Failed to fetch following list:", error);
        } finally {
            setLoading(false);
        }
    };

    return () => unsubscribeAuth();
  }, [router]);

  const artistsAndStudios = followingList.filter(u => u.role === 'Tattoo Artist' || u.role === 'Studio');
  const otherUsers = followingList.filter(u => u.role !== 'Tattoo Artist' && u.role !== 'Studio');

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Users className="h-8 w-8 text-primary"/>
        <h1 className="text-4xl font-headline font-bold">Following</h1>
      </div>

       {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-4 p-4 border rounded-lg">
              <Skeleton className="h-24 w-24 rounded-full" />
              <div className="space-y-2 text-center">
                 <Skeleton className="h-4 w-24 mx-auto" />
                 <Skeleton className="h-3 w-16 mx-auto" />
                 <Skeleton className="h-5 w-20 mx-auto" />
              </div>
               <Skeleton className="h-9 w-full mt-2" />
            </div>
          ))}
        </div>
       ) : followingList.length > 0 ? (
        <div className="space-y-8">
            {artistsAndStudios.length > 0 && (
                <section>
                    <h2 className="text-2xl font-headline font-semibold mb-4">Artists & Studios</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {artistsAndStudios.map((user) => (
                            <ArtistResultCard key={user.uid} user={user} />
                        ))}
                    </div>
                </section>
            )}

            {otherUsers.length > 0 && (
                 <section>
                    <Separator className="my-8"/>
                    <h2 className="text-2xl font-headline font-semibold mb-4">Other Users</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {otherUsers.map((user) => (
                            <ArtistResultCard key={user.uid} user={user} />
                        ))}
                    </div>
                </section>
            )}
        </div>
      ) : (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
            <h2 className="text-2xl font-semibold text-muted-foreground">You're not following anyone yet.</h2>
            <p className="mt-2 text-muted-foreground">Use the search to find artists and studios to follow.</p>
        </div>
      )}
    </div>
  );
}
