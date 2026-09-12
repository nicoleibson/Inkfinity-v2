// src/components/home/featured-artworks.tsx
"use client";

import { useEffect, useState } from "react";
import { database } from "@/lib/firebase-config";
import { ref, query, orderByChild, equalTo, get, limitToFirst } from "firebase/database";
import type { UserProfile } from "@/types/user";
import type { Artwork } from "@/types/artwork";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, ImageOff } from "lucide-react";
import { motion } from "framer-motion";

async function fetchFeaturedArtwork(): Promise<Artwork | null> {
    const usersRef = ref(database, 'users');
    const featuredUsersQuery = query(usersRef, orderByChild('claimedRewards/feature_slot'), equalTo(true));
    
    try {
        const snapshot = await get(featuredUsersQuery);
        if (!snapshot.exists()) {
            return null;
        }

        const featuredUserIds: string[] = [];
        snapshot.forEach(child => {
            featuredUserIds.push(child.key!);
        });

        if (featuredUserIds.length === 0) {
            return null;
        }

        const randomUserId = featuredUserIds[Math.floor(Math.random() * featuredUserIds.length)];

        const artworksRef = ref(database, 'artworks');
        const userArtworksQuery = query(artworksRef, orderByChild('artistId'), equalTo(randomUserId), limitToFirst(1));
        
        const artworkSnapshot = await get(userArtworksQuery);
        if (artworkSnapshot.exists()) {
            let artwork: Artwork | null = null;
            artworkSnapshot.forEach(child => {
                const artData = child.val();
                if(artData.moderationStatus !== 'pending_deletion' && !artData.isPrivate){
                    artwork = { id: child.key!, ...artData };
                }
            });
            return artwork;
        }
        return null;

    } catch (error) {
        console.error("Failed to fetch featured artwork:", error);
        return null;
    }
}

export function FeaturedArtworks() {
    const [artwork, setArtwork] = useState<Artwork | null>(null);
    const [loading, setLoading] = useState(true);
    const [imageError, setImageError] = useState(false);

    useEffect(() => {
        fetchFeaturedArtwork().then(result => {
            setArtwork(result);
            setLoading(false);
        });
    }, []);

    if (loading) {
        return (
            <div className="grid md:grid-cols-2 gap-8 items-center bg-card p-8 rounded-lg border border-primary/20 shadow-lg shadow-primary/10">
                <Skeleton className="aspect-video w-full" />
                <div className="space-y-4">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-10 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-12 w-48 mt-4" />
                </div>
            </div>
        )
    }

    if (!artwork) {
        return null; 
    }

    return (
        <motion.section 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="grid md:grid-cols-2 gap-8 items-center bg-card p-8 md:p-12 rounded-3xl border border-primary/20 shadow-2xl shadow-primary/10"
        >
            <div className="relative aspect-video rounded-2xl overflow-hidden group shadow-lg bg-muted flex items-center justify-center">
                 {!imageError && artwork.imageUrl ? (
                     <Image 
                         src={artwork.imageUrl} 
                         alt={artwork.title} 
                         fill 
                         onError={() => setImageError(true)}
                         className="object-contain transition-transform duration-500 group-hover:scale-105" 
                     />
                 ) : (
                     <div className="flex flex-col items-center gap-2 text-muted-foreground/60 p-4 text-center">
                         <ImageOff className="h-12 w-12" />
                         <p className="text-sm font-medium">{artwork.title}</p>
                     </div>
                 )}
                 <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                 <Link href={`/artwork/${artwork.id}`} className="absolute inset-0" aria-label={`View ${artwork.title}`}></Link>
            </div>
            <motion.div 
                initial={{ opacity: 0, x: 30 }} 
                whileInView={{ opacity: 1, x: 0 }} 
                viewport={{ once: true }} 
                transition={{ delay: 0.2, duration: 0.6 }}
                className="space-y-4"
            >
                <div className="flex items-center gap-2 text-amber-400">
                    <Star className="h-5 w-5 fill-amber-400" />
                    <h2 className="font-headline text-lg">Featured Artwork</h2>
                </div>
                <h3 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight">{artwork.title}</h3>
                <p className="text-muted-foreground line-clamp-3">
                   {artwork.description}
                </p>
                <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">by</p>
                    <Link href={`/${artwork.artistUsername}`} className="font-semibold text-primary hover:underline">{artwork.artistName}</Link>
                </div>
                <Button asChild size="lg" className="mt-4">
                    <Link href={`/artwork/${artwork.id}`}>View Artwork</Link>
                </Button>
            </motion.div>
        </motion.section>
    );
}

    
