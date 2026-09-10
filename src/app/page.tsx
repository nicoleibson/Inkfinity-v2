// src/app/page.tsx
"use client";

import { useEffect, useState, Suspense } from "react";
import { database, auth } from "@/lib/firebase-config";
import { ref, onValue, query, limitToLast, orderByChild, get } from "firebase/database";
import ArtworkCard from "@/components/artwork-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, ChevronRight, Sparkles, ShieldCheck, MapPin, Award, ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Artwork } from "@/types/artwork";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FeaturedArtists } from "@/components/home/featured-artists";
import { FeaturedStudios } from "@/components/home/featured-studios";
import { FeaturedArtworks } from "@/components/home/featured-artworks";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import type { UserProfile } from "@/types/user";
import { motion } from "framer-motion";

const POPULAR_STYLES = [
  "Realism",
  "Blackwork",
  "Traditional",
  "Neo-Traditional",
  "Fine Line",
  "Japanese",
  "Watercolor",
  "Geometric",
  "Lettering"
];

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
    <div className="space-y-16 md:space-y-24">
      {/* Hero Section */}
      <motion.section 
        initial={{ opacity: 0, y: 25, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, type: "spring" }}
        className="relative overflow-hidden text-center bg-card/80 backdrop-blur-md py-14 px-6 md:py-20 md:px-12 rounded-3xl border border-primary/20 shadow-2xl shadow-primary/10"
      >
        <div className="absolute inset-0 bg-radial from-primary/15 via-transparent to-transparent opacity-70 pointer-events-none" />
        
        <div className="relative z-10 max-w-4xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-semibold tracking-wide">
            <Sparkles className="h-3.5 w-3.5" />
            <span>The Premier Global Tattoo Network</span>
          </div>

          <motion.h1 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.15 }}
            className="font-headline text-4xl sm:text-6xl lg:text-7xl font-extrabold text-foreground tracking-tight"
          >
            Ink Your <span className="text-primary">Vision</span> Into Reality
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ delay: 0.25 }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-normal leading-relaxed"
          >
            Explore verified master artists, discover studio spaces, and find your next custom tattoo design with blockchain authenticity.
          </motion.p>

          {/* Desktop Integrated Search Bar */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.35 }}
            className="pt-2 max-w-2xl mx-auto"
          >
            <form onSubmit={handleSearch} className="relative">
              <div className="flex flex-col sm:flex-row items-center gap-2 p-2 bg-background/90 backdrop-blur-xl rounded-2xl border border-border shadow-lg">
                <div className="relative w-full flex-grow flex items-center">
                  <Search className="absolute left-3.5 h-5 w-5 text-muted-foreground pointer-events-none" />
                  <Input 
                    placeholder="Search styles, artists, studios, motifs (e.g. Dragon, Realism)..." 
                    className="pl-11 pr-4 h-12 text-base border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent placeholder:text-muted-foreground/70"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button type="submit" size="lg" className="w-full sm:w-auto h-12 px-7 rounded-xl font-semibold gap-2 shadow-md">
                  <Search className="h-4 w-4" />
                  <span>Search</span>
                </Button>
              </div>
            </form>

            {/* Popular Style Tags / Quick Filters for Desktop */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs">
              <span className="text-muted-foreground font-medium mr-1 flex items-center gap-1">
                Trending Styles:
              </span>
              {POPULAR_STYLES.map((style) => (
                <button
                  key={style}
                  onClick={() => router.push(`/search?q=${encodeURIComponent(style)}&cat=artwork`)}
                  className="px-3 py-1 rounded-lg bg-card hover:bg-primary/10 border border-border/80 hover:border-primary/40 text-muted-foreground hover:text-primary transition-all duration-200 cursor-pointer"
                >
                  {style}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Desktop Value Props / Key Features Bar */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="p-5 rounded-2xl border border-border/70 bg-card/60 hover:bg-card/90 transition-all duration-200 flex items-start gap-4">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0 border border-primary/20">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">Verified Artists</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Curated artist profiles with verified portfolios and genuine client reviews.
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border/70 bg-card/60 hover:bg-card/90 transition-all duration-200 flex items-start gap-4">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0 border border-primary/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">Custom Tattoos</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              High-resolution artworks categorized by body placement and artistic technique.
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border/70 bg-card/60 hover:bg-card/90 transition-all duration-200 flex items-start gap-4">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0 border border-primary/20">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">Local Studios</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Geolocation search to connect you with top-rated studios in your city.
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border/70 bg-card/60 hover:bg-card/90 transition-all duration-200 flex items-start gap-4">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0 border border-primary/20">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">Web3 & Rewards</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Earn rewards points, claim exclusive perks, and certify art on the blockchain.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Artwork Spotlight */}
      <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>}>
        <FeaturedArtworks />
      </Suspense>

      {/* Featured Artists Section with Desktop Header */}
      <motion.section 
        initial={{ opacity: 0, y: 30 }} 
        whileInView={{ opacity: 1, y: 0 }} 
        viewport={{ once: true }} 
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border/60 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary mb-1">
              <span>Featured Talent</span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-headline font-extrabold tracking-tight text-foreground">
              Featured Artists
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Discover talented tattoo artists and explore their verified portfolios
            </p>
          </div>
          <Button variant="outline" size="sm" asChild className="rounded-xl border-border hover:border-primary/40 text-xs sm:text-sm shrink-0">
            <Link href="/search?cat=artist" className="flex items-center gap-1.5">
              <span>View All Artists</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          </Button>
        </div>
        <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>}>
          <FeaturedArtists />
        </Suspense>
      </motion.section>
      
      {/* Featured Studios Section with Desktop Header */}
      <motion.section 
        initial={{ opacity: 0, y: 30 }} 
        whileInView={{ opacity: 1, y: 0 }} 
        viewport={{ once: true }} 
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border/60 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary mb-1">
              <span>Verified Spaces</span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-headline font-extrabold tracking-tight text-foreground">
              Featured Studios
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Find premier tattoo studios and creative resident spaces near you
            </p>
          </div>
          <Button variant="outline" size="sm" asChild className="rounded-xl border-border hover:border-primary/40 text-xs sm:text-sm shrink-0">
            <Link href="/search?cat=studio" className="flex items-center gap-1.5">
              <span>View All Studios</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          </Button>
        </div>
        <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>}>
          <FeaturedStudios />
        </Suspense>
      </motion.section>

      {/* Explore Artworks Section */}
      <motion.section 
        initial={{ opacity: 0, y: 30 }} 
        whileInView={{ opacity: 1, y: 0 }} 
        viewport={{ once: true }} 
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border/60 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary mb-1">
              <span>Community Feed</span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-headline font-extrabold tracking-tight text-foreground">
              Explore Artworks
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Browse the latest masterpieces shared by tattoo enthusiasts and artists worldwide
            </p>
          </div>
          <Button variant="outline" size="sm" asChild className="rounded-xl border-border hover:border-primary/40 text-xs sm:text-sm shrink-0">
            <Link href="/search?cat=artwork" className="flex items-center gap-1.5">
              <span>Advanced Search</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          </Button>
        </div>
        
        {loading ? (
          <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-2 break-inside-avoid-column">
                <Skeleton className="h-[300px] w-full rounded-2xl" />
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
          <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl bg-card/40">
            <h2 className="text-2xl font-semibold text-foreground">No artworks found.</h2>
            <p className="mt-2 text-muted-foreground">Try uploading a new artwork or check back later!</p>
            <Button asChild className="mt-4 rounded-xl" size="sm">
              <Link href="/upload">Upload First Artwork</Link>
            </Button>
          </div>
        )}
      </motion.section>
    </div>
  );
}
