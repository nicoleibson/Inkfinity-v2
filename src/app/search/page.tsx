
// src/app/search/page.tsx
"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Search as SearchIcon, Loader2, MapPin, XCircle } from "lucide-react";
import { auth, database } from "@/lib/firebase-config";
import { ref, get, update, push, serverTimestamp, query, orderByChild, limitToLast, equalTo } from "firebase/database";
import type { UserProfile } from "@/types/user";
import type { Artwork } from "@/types/artwork";
import { ArtistResultCard } from "@/components/search/artist-result-card";
import { ArtworkResultCard } from "@/components/search/artwork-result-card";
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { geocodeAddress } from "@/ai/flows/geocode-address-flow";
import { useToast } from "@/hooks/use-toast";

type SearchCategory = "artwork" | "artist" | "studio" | "supply_store";

// Helper function to calculate distance between two lat/lng points
const haversineDistance = (coords1: {lat: number, lng: number}, coords2: {lat: number, lng: number}) => {
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


function SearchPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const [keywords, setKeywords] = useState(searchParams.get('q') || "");
  const [category, setCategory] = useState<SearchCategory>((searchParams.get('cat') as SearchCategory) || "artwork");
  
  // New state for location
  const [userCoordinates, setUserCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);

  const [results, setResults] = useState<(UserProfile | Artwork)[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);

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

  const handleGetLocation = () => {
    setIsFetchingLocation(true);
    setLocationName(null);
    setUserCoordinates(null);
    if (!navigator.geolocation) {
        toast({
            variant: "destructive",
            title: "Geolocation Not Supported",
            description: "Your browser does not support geolocation.",
        });
        setIsFetchingLocation(false);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            const coords = { lat: latitude, lng: longitude };
            setUserCoordinates(coords);
            try {
                const result = await geocodeAddress(coords);
                setLocationName(result.address);
                toast({ title: "Location Set", description: `Searching near ${result.address}.` });
            } catch (error) {
                console.error("Reverse geocoding failed:", error);
                setLocationName("Current Location");
                toast({ title: "Location Set", description: "Your current location will be used for the search." });
            } finally {
                setIsFetchingLocation(false);
            }
        },
        (error) => {
            console.error("Geolocation error:", error);
            let description = "An unknown error occurred.";
            if (error.code === error.PERMISSION_DENIED) {
                description = "Please allow location access in your browser settings.";
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                description = "Your location information is currently unavailable.";
            }
            toast({
                variant: "destructive",
                title: "Geolocation Failed",
                description: description,
            });
            setIsFetchingLocation(false);
        }
    );
  };
  
  const clearLocation = () => {
    setUserCoordinates(null);
    setLocationName(null);
  };

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setHasSearched(true);

    const params = new URLSearchParams();
    if (keywords) params.set('q', keywords);
    // Location is no longer a text input, so we don't set 'loc' param
    params.set('cat', category);
    router.replace(`${pathname}?${params.toString()}`);
    
    // Use the coordinates from state
    const targetCoords = userCoordinates;
    
    const dbRefPath = category === 'artwork' ? 'artworks' : 'users';
    const queryRef = query(ref(database, dbRefPath), limitToLast(200));
    
    const snapshot = await get(queryRef);
    let allData: (UserProfile | Artwork)[] = [];

    if (snapshot.exists()) {
        snapshot.forEach(childSnapshot => {
            allData.push({ id: childSnapshot.key, ...childSnapshot.val() } as any);
        });
    }
    
    const lowercasedKeywords = keywords.toLowerCase().split(' ').filter(k => k);

    let filteredData = allData.filter(item => {
        if (lowercasedKeywords.length > 0) {
            const isKeywordMatch = lowercasedKeywords.every(keyword => {
                if (category === 'artwork') {
                    const artwork = item as Artwork;
                    const searchableText = [
                        artwork.title,
                        artwork.description,
                        ...(artwork.tags || [])
                    ].join(' ').toLowerCase();
                    return searchableText.includes(keyword);
                } else {
                    const user = item as UserProfile;
                    const searchableText = [
                        user.name,
                        user.username,
                        user.bio
                    ].join(' ').toLowerCase();
                    return searchableText.includes(keyword);
                }
            });
            if (!isKeywordMatch) return false;
        }

        if (category !== 'artwork') {
            const user = item as UserProfile;
            let roleMatch = false;
            if (category === 'artist' && user.role === 'Tattoo Artist') roleMatch = true;
            if (category === 'studio' && user.role === 'Studio') roleMatch = true;
            if (category === 'supply_store' && user.role === 'Supply Store') roleMatch = true;
            if (!roleMatch) return false;
        }

        return true;
    });

    if (targetCoords) {
        filteredData = filteredData
            .map(item => {
                if (!item.location) return { ...item, distance: Infinity };
                const distance = haversineDistance(targetCoords!, item.location);
                return { ...item, distance };
            })
            .filter(item => (item as any).distance <= 100)
            .sort((a, b) => (a as any).distance - (b as any).distance);
    }

    setResults(filteredData);
    setLoading(false);
  }, [category, keywords, userCoordinates, pathname, router]);

  const handleCreateChat = async (targetUser: UserProfile) => {
    if (!currentUserProfile || !currentUserProfile.uid || !currentUserProfile.name || !currentUserProfile.avatarUrl) {
        toast({ variant: 'destructive', title: 'Please log in to message users.' });
        return;
    }

    setIsCreatingChat(true);
    const chatId = [currentUserProfile.uid, targetUser.uid].sort().join('_');
    
    try {
        const chatRef = ref(database, `chats/${chatId}`);
        const newChatData = {
            createdAt: serverTimestamp(),
            participants: {
                [currentUserProfile.uid]: true,
                [targetUser.uid]: true,
            },
            participantInfo: {
                [currentUserProfile.uid]: {
                    name: currentUserProfile.name,
                    avatarUrl: currentUserProfile.avatarUrl,
                },
                [targetUser.uid]: {
                    name: targetUser.name,
                    avatarUrl: targetUser.avatarUrl,
                },
            },
            lastMessage: {
                text: 'Chat created.',
                timestamp: serverTimestamp(),
                senderId: 'system',
            },
        };

        const updates: { [key: string]: any } = {};
        updates[`/chats/${chatId}`] = newChatData;
        updates[`/users/${currentUserProfile.uid}/chats/${chatId}`] = true;

        await update(ref(database), updates);
        router.push(`/chat/${chatId}`);
    } catch (error) {
        console.error('Failed to create chat:', error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not start a conversation.' });
    } finally {
        setIsCreatingChat(false);
    }
  };


  useEffect(() => {
    if (searchParams.get('q') || searchParams.get('cat')) {
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-headline font-bold text-primary">Advanced Search</h1>
        <p className="text-muted-foreground mt-2">Find exactly what you're looking for.</p>
      </div>

      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="font-headline">Filter Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="keywords">Keywords</Label>
              <Input 
                id="keywords" 
                placeholder="e.g., Dragon, Rose, Skull..." 
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
            </div>
             <div className="space-y-2">
              <Label>Location</Label>
              <div className="flex gap-2">
                 <Button
                    type="button"
                    variant="outline"
                    onClick={handleGetLocation}
                    disabled={isFetchingLocation}
                    className="w-full"
                >
                    {isFetchingLocation ? <Loader2 className="animate-spin" /> : <MapPin />}
                    <span className="ml-2">Use My Location</span>
                </Button>
                {locationName && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={clearLocation}
                  >
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                  </Button>
                )}
              </div>
              {locationName && (
                <p className="text-xs text-muted-foreground pt-1">
                  Searching near: <strong>{locationName}</strong>
                </p>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={(value: SearchCategory) => setCategory(value)}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Search for..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="artwork">Artwork</SelectItem>
                  <SelectItem value="artist">Artists</SelectItem>
                  <SelectItem value="studio">Studios</SelectItem>
                  <SelectItem value="supply_store">Supply Stores</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button size="lg" className="w-full" onClick={handleSearch} disabled={loading}>
            {loading ? <Loader2 className="animate-spin"/> : <SearchIcon />}
            Search
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <div className="text-center">
            <h2 className="text-3xl font-headline text-foreground">Search Results</h2>
        </div>
        {loading ? (
             <div className="flex justify-center p-8">
                <Loader2 className="h-10 w-10 animate-spin text-primary"/>
             </div>
        ) : hasSearched ? (
            results.length > 0 ? (
                 <div className={category === 'artwork' ? "columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6" : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6"}>
                    {results.map(item => {
                        const uniqueKey = (item as any).id || (item as any).uid;
                        if (category === 'artwork') {
                            return <ArtworkResultCard key={uniqueKey} artwork={item as Artwork} currentUserProfile={currentUserProfile} />;
                        } else {
                            return (
                              <ArtistResultCard 
                                key={uniqueKey}
                                user={item as UserProfile} 
                                currentUser={currentUserProfile}
                                onCreateChat={handleCreateChat}
                                isCreatingChat={isCreatingChat}
                              />
                            );
                        }
                    })}
                </div>
            ) : (
                <p className="text-muted-foreground mt-4 text-center">No results found. Try adjusting your filters.</p>
            )
        ) : (
             <p className="text-muted-foreground mt-4 text-center">Enter your search criteria above and click Search.</p>
        )}
      </div>
    </div>
  );
}


export default function SearchPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-96"><Loader2 className="h-16 w-16 animate-spin" /></div>}>
            <SearchPageClient />
        </Suspense>
    )
}
