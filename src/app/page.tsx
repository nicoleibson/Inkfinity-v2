// src/app/page.tsx
"use client";

import { useEffect, useState, Suspense } from "react";
import { database, auth } from "@/lib/firebase-config";
import { ref, onValue, query, limitToLast, orderByChild, get } from "firebase/database";
import ArtworkCard from "@/components/artwork-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Artwork } from "@/types/artwork";
import { useRouter } from "next/navigation";
import { FeaturedArtists } from "@/components/home/featured-artists";
import { FeaturedStudios } from "@/components/home/featured-studios";
import { FeaturedArtworks } from "@/components/home/featured-artworks";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import type { UserProfile } from "@/types/user";
import { motion } from "framer-motion";

type Coords = {
  lat: number;
  lng: number;
};

export default function Home() {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [userLocation, setUserLocation] = useState<Coords | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = ref(database, `users/${user.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          setCurrentUserProfile({ uid: user.uid, ...snapshot.val() });
        }
      } else {
        setCurrentUserProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const haversineDistance = (coords1: Coords, coords2: Coords) => {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371; // Earth radius in km

    const dLat = toRad(coords2.lat - coords1.lat);
    const dLon = toRad(coords2.lng - coords1.lng);
    const lat1 = toRad(coords1.lat);
    const lat2 = toRad(coords2.lat);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.warn("Geolocation permission denied or unavailable.", error);
        }
      );
    }
  }, []);

  useEffect(() => {
    const artworksRef = query(ref(database, 'artworks'), orderByChild('likesCount'), limitToLast(100));
    
    const unsubscribe = onValue(artworksRef, (snapshot) => {
      const artworksData: Artwork[] = [];
      if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
          artworksData.push({ id: childSnapshot.key!, ...childSnapshot.val() });
        });
      }

      const filteredAndSorted = artworksData
        .filter(a => a.moderationStatus !== 'pending_deletion' && !a.isPrivate)
        .sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));

      if (userLocation) {
        const nearbyArtworks = filteredAndSorted
          .map(artwork => ({
            ...artwork,
            distance: artwork.location ? haversineDistance(userLocation, artwork.location) : Infinity,
          }))
          .filter(artwork => artwork.distance <= 100) // 100km radius
          .sort((a, b) => a.distance - b.distance);
        
        if (nearbyArtworks.length > 0) {
            setArtworks(nearbyArtworks.slice(0, 20));
        } else {
            // Fallback: If no nearby artworks, show the most liked ones.
            setArtworks(filteredAndSorted.slice(0, 20));
        }
      } else {
        // Default: If no location, show most liked.
        setArtworks(filteredAndSorted.slice(0, 20));
      }
      
      setLoading(false);
    }, (error) => {
        console.error("Error fetching artworks: ", error);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [userLocation]);


  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
        router.push(`/search?q=${encodeURIComponent(searchQuery)}&cat=artwork`);
    } else {
        router.push('/search');
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  return (
    <div className="space-y-12">
      <motion.section 
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, type: "spring" }}
        className="relative overflow-hidden text-center bg-card p-12 md:p-24 rounded-3xl border border-primary/20 shadow-2xl shadow-primary/20"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10 opacity-50 pointer-events-none" />
        <motion.h1 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="font-headline text-5xl md:text-7xl font-extrabold text-primary tracking-tight"
        >
          Inkfinity
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="mt-6 text-xl text-muted-foreground max-w-2xl mx-auto"
        >
          Discover the world's finest tattoo art. Connect with artists and find your next masterpiece.
        </motion.p>
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="mt-10 max-w-2xl mx-auto relative z-10"
        >
           <form onSubmit={handleSearch}>
              <div className="flex flex-col md:flex-row items-center gap-4 p-2 bg-background rounded-lg border border-border">
                  <div className="relative w-full md:flex-grow">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input 
                          placeholder="Search for artwork, artists, or styles..." 
                          className="pl-10"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                      />
                  </div>
                  <Button type="submit" className="w-full md:w-auto">
                      <Search className="mr-2 h-4 w-4" />
                      Search
                  </Button>
              </div>
          </form>
        </motion.div>
      </motion.section>

      <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin"/></div>}>
        <FeaturedArtworks />
      </Suspense>

      <motion.section 
        initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
        className="space-y-6"
      >
        <div className="text-center">
            <h2 className="text-3xl md:text-4xl font-headline font-extrabold tracking-tight">Featured Artists</h2>
            <p className="text-muted-foreground mt-2">Discover talented tattoo artists from around the world</p>
        </div>
         <Suspense fallback={<p>Loading...</p>}>
           <FeaturedArtists />
        </Suspense>
      </motion.section>
      
       <motion.section 
        initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
        className="space-y-6"
      >
        <div className="text-center">
            <h2 className="text-3xl md:text-4xl font-headline font-extrabold tracking-tight">Featured Studios</h2>
            <p className="text-muted-foreground mt-2">Find the best tattoo studios near you</p>
        </div>
         <Suspense fallback={<p>Loading...</p>}>
           <FeaturedStudios />
        </Suspense>
      </motion.section>

      <motion.section 
        initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
        className="space-y-6"
      >
        <div className="text-center">
            <h2 className="text-3xl md:text-4xl font-headline font-extrabold tracking-tight">Explore Artworks</h2>
            <p className="text-muted-foreground mt-2">Browse the latest masterpieces from our community</p>
        </div>
        
        {loading ? (
          <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-2 break-inside-avoid-column">
                <Skeleton className="h-[300px] w-full" />
              </div>
            ))}
          </div>
        ) : artworks.length > 0 ? (
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6"
          >
            {artworks.map((artwork) => (
              <div key={artwork.id} className="break-inside-avoid-column">
                <ArtworkCard artwork={artwork} currentUserProfile={currentUserProfile} />
              </div>
            ))}
          </motion.div>
        ) : (
            <div className="text-center py-16 border-2 border-dashed rounded-lg col-span-full">
                <h2 className="text-2xl font-semibold text-muted-foreground">No artworks found.</h2>
                <p className="mt-2 text-muted-foreground">Try uploading a new artwork or check back later!</p>
            </div>
        )}
      </motion.section>
    </div>
  );
}
