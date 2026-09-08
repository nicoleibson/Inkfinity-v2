// src/components/home/featured-artists.tsx
"use client";

import { useEffect, useState } from "react";
import { database } from "@/lib/firebase-config";
import { ref, query, orderByChild, equalTo, get } from "firebase/database";
import type { UserProfile } from "@/types/user";
import { ArtistResultCard } from "@/components/search/artist-result-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"

function shuffleArray(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export function FeaturedArtists() {
    const [artists, setArtists] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchArtists = async () => {
            const usersRef = query(ref(database, 'users'), orderByChild('role'), equalTo('Tattoo Artist'));
            try {
                const snapshot = await get(usersRef);
                if (snapshot.exists()) {
                    const allArtists: UserProfile[] = [];
                    snapshot.forEach(child => {
                        allArtists.push({ uid: child.key!, ...child.val() });
                    });
                    const shuffled = shuffleArray(allArtists);
                    setArtists(shuffled.slice(0, 8)); // Get up to 8 random artists for the carousel
                }
            } catch (error) {
                console.error("Failed to fetch featured artists:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchArtists();
    }, []);

    if (loading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
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
        )
    }
    
    if (artists.length === 0) {
        return <p className="text-center text-muted-foreground">No artists to feature yet.</p>
    }

    return (
        <Carousel
          opts={{
            align: "start",
            loop: true,
          }}
          className="w-full max-w-sm sm:max-w-xl md:max-w-3xl lg:max-w-5xl mx-auto"
        >
          <CarouselContent className="-ml-4">
            {artists.map(artist => (
              <CarouselItem key={artist.uid} className="pl-4 basis-full sm:basis-1/2 md:basis-1/3 lg:basis-1/4">
                <div className="p-1 h-full">
                    <ArtistResultCard user={artist} />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
    )
}
