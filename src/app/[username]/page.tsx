// src/app/[username]/page.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { database, auth } from '@/lib/firebase-config';
import { ref, get, update, increment, query, orderByChild, equalTo, onValue, serverTimestamp, push, runTransaction, set } from 'firebase/database';
import ArtworkCard from '@/components/artwork-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Link as LinkIcon, UserPlus, Loader2, UserMinus, Lock, MessageSquare, Building, Star, Twitter, Instagram, Package, Gem, Users, LayoutGrid, BookUser, MessageCircle, Send } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Artwork } from '@/types/artwork';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { BookingDialog } from '@/components/bookings/booking-dialog';
import { useUserSession } from '@/hooks/useUserSession';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile, Notification } from '@/types/user';
import type { Review } from '@/types/review';
import type { Product } from '@/types/product';
import { Skeleton } from '@/components/ui/skeleton';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArtistResultCard } from '@/components/search/artist-result-card';
import { ProductCard } from '@/components/products/product-card';
import { ReviewCard } from '@/components/reviews/review-card';
import { FollowListDialog } from '@/components/profile/follow-list-dialog';
import { StatCard } from '@/components/ui/stat-card';
import { motion } from 'framer-motion';

// Helper function to determine which tabs to show based on profile
const getTabsForProfile = (profile: UserProfile | null, residentArtistsCount: number, reviewsCount: number) => {
    if (!profile) return [];

    const tabs = [];
    if (profile.role === 'Client') {
        tabs.push({ value: 'stats', label: 'Stats' });
    }
    
    const canViewArtworks = ['Tattoo Artist', 'Studio'].includes(profile.role);
    if (canViewArtworks) tabs.push({ value: 'artworks', label: 'Artworks'});

    const hasProducts = profile.role === 'Supply Store';
    if (hasProducts) tabs.push({ value: 'products', label: 'Products'});
    
    const hasArtists = profile.role === 'Studio' && residentArtistsCount > 0;
    if (hasArtists) tabs.push({ value: 'artists', label: 'Artists'});
    
    if (reviewsCount > 0) tabs.push({ value: 'reviews', label: 'Reviews' });

    tabs.push({ value: 'about', label: 'About'});
    return tabs;
}

export default function UserProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const router = useRouter();
  const [profileUser, setProfileUser] = useState<UserProfile | null>(null);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [residentArtists, setResidentArtists] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientBookingsCount, setClientBookingsCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followStateDetermined, setFollowStateDetermined] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [followDialog, setFollowDialog] = useState<{ open: boolean; type: 'followers' | 'following' }>({ open: false, type: 'followers' });

  const { toast } = useToast();
  
  useUserSession(currentUserProfile); 

  // Effect to get the current user's profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (user) {
        const userRef = ref(database, `users/${user.uid}`);
        return onValue(userRef, snapshot => {
          setCurrentUserProfile(snapshot.exists() ? { uid: user.uid, ...snapshot.val() } : null);
        });
      } else {
        setCurrentUserProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);
  
  // Effect to determine following state once both profiles are loaded
  useEffect(() => {
      if (profileUser && currentUserProfile) {
          setIsFollowing(!!(profileUser.followersList && profileUser.followersList[currentUserProfile.uid]));
      } else {
          setIsFollowing(false);
      }
      if (profileUser) { // We can determine the follow state as long as the profile user is loaded
          setFollowStateDetermined(true);
      }
  }, [profileUser, currentUserProfile]);

  // Main data fetching effect for the profile being viewed
  useEffect(() => {
    if (!username) return;

    const fetchProfileData = async () => {
      setLoading(true);
      setError(null);

      try {
        const usernameRef = ref(database, `usernames/${username}`);
        const usernameSnapshot = await get(usernameRef);

        if (!usernameSnapshot.exists()) {
          setError('User not found.');
          setLoading(false);
          return;
        }

        const uid = usernameSnapshot.val();
        const userRef = ref(database, `users/${uid}`);
        
        // Use `get` for initial load, `onValue` can be for real-time updates if needed
        const userSnapshot = await get(userRef);

        if (userSnapshot.exists()) {
          const userData = { uid, ...userSnapshot.val() } as UserProfile;
          setProfileUser(userData);
          
          // Once we have the user, fetch all related data in parallel
          const dataPromises = [];
          
          if (['Tattoo Artist', 'Studio'].includes(userData.role)) {
              dataPromises.push(get(query(ref(database, 'artworks'), orderByChild('artistId'), equalTo(uid))).then(snap => {
                  const data: Artwork[] = [];
                  snap.forEach(child => { data.push({ id: child.key!, ...child.val() }); });
                  setArtworks(data.reverse());
              }));
          }

          if (userData.role === 'Supply Store') {
              dataPromises.push(get(query(ref(database, 'products'), orderByChild('ownerId'), equalTo(uid))).then(snap => {
                  const data: Product[] = [];
                  snap.forEach(child => { data.push({ id: child.key!, ...child.val() }); });
                  setProducts(data.reverse());
              }));
          }
          
          if (userData.reviewCount && userData.reviewCount > 0) {
              dataPromises.push(get(query(ref(database, 'reviews'), orderByChild('revieweeId'), equalTo(uid))).then(snap => {
                  const data: Review[] = [];
                  snap.forEach(child => { data.push({ id: child.key!, ...child.val() }); });
                  setReviews(data.reverse());
              }));
          }
          
          if (userData.role === 'Studio' && userData.residentArtists) {
              const artistIds = Object.keys(userData.residentArtists);
              const artistPromises = artistIds.map(id => get(ref(database, `users/${id}`)));
              dataPromises.push(Promise.all(artistPromises).then(snapshots => {
                  const artistsData = snapshots.map(s => s.exists() ? { uid: s.key, ...s.val() } : null).filter(Boolean) as UserProfile[];
                  setResidentArtists(artistsData);
              }));
          }

          if (userData.role === 'Client') {
              dataPromises.push(get(query(ref(database, 'bookings'), orderByChild('clientId'), equalTo(uid))).then(snap => {
                  setClientBookingsCount(snap.exists() ? snap.size : 0);
              }));
          }

          await Promise.all(dataPromises);
        } else {
          setError('User profile data is missing.');
        }
      } catch (err) {
        console.error("Error fetching user data:", err);
        setError('Failed to fetch user data.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [username]);

  const handleFollowToggle = async () => {
    if (!currentUserProfile || !profileUser) {
        toast({ variant: 'destructive', title: 'You must be logged in to follow users.' });
        return;
    }
    if (currentUserProfile.uid === profileUser.uid) {
        toast({ variant: 'destructive', title: 'You cannot follow yourself.' });
        return;
    }

    setIsFollowLoading(true);
    const newFollowingState = !isFollowing;
    
    const updates: { [key: string]: any } = {
        [`/users/${currentUserProfile.uid}/followingList/${profileUser.uid}`]: newFollowingState ? true : null,
        [`/users/${profileUser.uid}/followersList/${currentUserProfile.uid}`]: newFollowingState ? true : null,
        [`/users/${currentUserProfile.uid}/followingCount`]: increment(newFollowingState ? 1 : -1),
        [`/users/${profileUser.uid}/followersCount`]: increment(newFollowingState ? 1 : -1)
    };

    try {
        await update(ref(database), updates);
        
        if (newFollowingState) {
            const notificationsRef = ref(database, `users/${profileUser.uid}/notifications`);
            const newNotification: Omit<Notification, 'id'> = {
                type: 'follow',
                fromUserId: currentUserProfile.uid,
                fromUserName: currentUserProfile.name || 'A user',
                message: `${currentUserProfile.name || 'A new user'} started following you.`,
                isRead: false,
                createdAt: serverTimestamp(),
                link: `/${currentUserProfile.username}`
            };
            await push(notificationsRef, newNotification);
        }

        setIsFollowing(newFollowingState);
        toast({
            title: newFollowingState ? 'Followed!' : 'Unfollowed',
            description: `You are now ${newFollowingState ? 'following' : 'no longer following'} ${profileUser.name}.`,
        });
    } catch (error) {
        console.error("Follow/unfollow error:", error);
        toast({ variant: 'destructive', title: 'An error occurred.', description: 'Could not update follow status.' });
    } finally {
        setIsFollowLoading(false);
    }
  };

    const handleCreateChat = async () => {
        if (!currentUserProfile || !profileUser) {
            toast({ variant: 'destructive', title: 'Please log in to message users.' });
            return;
        }

        setIsCreatingChat(true);
        const chatId = [currentUserProfile.uid, profileUser.uid].sort().join('_');
        
        try {
            const chatRef = ref(database, `chats/${chatId}`);
            
            // Use a transaction to create the chat only if it doesn't exist
            await runTransaction(chatRef, (currentData) => {
                if (currentData === null) {
                    return {
                         createdAt: serverTimestamp(),
                        participants: {
                            [currentUserProfile.uid]: true,
                            [profileUser.uid]: true,
                        },
                        participantInfo: {
                            [currentUserProfile.uid]: { name: currentUserProfile.name, avatarUrl: currentUserProfile.avatarUrl },
                            [profileUser.uid]: { name: profileUser.name, avatarUrl: profileUser.avatarUrl },
                        },
                        lastMessage: {
                            text: 'Chat created.',
                            timestamp: serverTimestamp(),
                            senderId: 'system',
                        },
                    };
                }
                return; // Abort transaction if chat already exists
            });

            // Update user's chat list regardless
            const updates: { [key: string]: boolean } = {};
            updates[`/users/${currentUserProfile.uid}/chats/${chatId}`] = true;
            updates[`/users/${profileUser.uid}/chats/${chatId}`] = true;
            await update(ref(database), updates);
            
            router.push(`/chat/${chatId}`);
        } catch (error) {
            console.error('Failed to create chat:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not start a conversation.' });
        } finally {
            setIsCreatingChat(false);
        }
    };


  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="h-16 w-16 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <h2 className="text-2xl font-semibold text-destructive">{error}</h2>
        <p className="mt-2 text-muted-foreground">Please check the username and try again.</p>
      </div>
    );
  }

  if (!profileUser) {
    return null; // Should be handled by loading or error state
  }
  
  const isAdmin = currentUserProfile?.role === 'Administrator' || currentUserProfile?.role === 'Super-Administrator';
  const canInteract = currentUserProfile && currentUserProfile.uid !== profileUser.uid && !isAdmin;
  const isBookable = profileUser.role === 'Tattoo Artist' || profileUser.role === 'Studio';
  const canViewProfile = !profileUser.isPrivate || isFollowing || (currentUserProfile?.uid === profileUser.uid) || isAdmin;
  const isViewingAsSupplyStore = currentUserProfile?.role === 'Supply Store';
  
  const tabs = getTabsForProfile(profileUser, residentArtists.length, reviews.length);
  const defaultTab = tabs[0]?.value || 'about';

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      },
    },
  };

  const tabVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 26 } },
  };

  return (
    <>
      <BookingDialog 
        open={isBookingDialogOpen} 
        onOpenChange={setIsBookingDialogOpen}
        artist={profileUser}
      />
      <FollowListDialog
        userId={profileUser.uid}
        type={followDialog.type}
        open={followDialog.open}
        onOpenChange={(open) => setFollowDialog(prev => ({...prev, open}))}
      />
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-8"
      >
        <motion.div variants={tabVariants}>
        <Card className="overflow-hidden border border-primary/10 shadow-lg hover:shadow-2xl hover:shadow-primary/10 transition-shadow duration-300">
          <div className="h-48 md:h-64 bg-card-foreground/10 relative overflow-hidden">
            <Image
              src={profileUser.backgroundUrl || "https://placehold.co/1200x400.png"}
              data-ai-hint="abstract texture"
              alt="Banner"
              fill
              className="object-cover transition-transform duration-700 hover:scale-105"
              unoptimized={Boolean(profileUser.backgroundUrl && (profileUser.backgroundUrl.startsWith('/uploads') || profileUser.backgroundUrl.startsWith('data:') || profileUser.backgroundUrl.includes('lh3.googleusercontent.com')))}
            />
          </div>
          <div className="p-6 pt-0">
            <div className="flex flex-col items-center md:flex-row md:items-end gap-6 -mt-20 transform md:-translate-y-1/2">
                <Avatar className="h-32 w-32 md:h-40 md:w-40 border-4 border-background bg-background shadow-lg shrink-0">
                  <AvatarImage src={profileUser.avatarUrl} data-ai-hint="artist portrait" alt={profileUser.name} />
                  <AvatarFallback className='text-4xl'>{profileUser.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-grow flex flex-col md:flex-row items-center md:items-end justify-between gap-4 w-full">
                  <div className="flex-grow text-center md:text-left mt-4 md:mt-0">
                    <div className="flex items-center justify-center md:justify-start gap-2">
                        <h1 className="text-3xl font-headline font-bold">{profileUser.name}</h1>
                        {profileUser.isPrivate && <Lock className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <div className="flex items-center gap-2 justify-center md:justify-start">
                        <p className="text-primary">@{profileUser.username}</p>
                        {profileUser.rating && profileUser.reviewCount ? (
                            <div className="flex items-center gap-1 text-amber-400">
                                <Star className="w-4 h-4 fill-amber-400" />
                                <span className="font-bold">{profileUser.rating.toFixed(1)}</span>
                                <span className="text-xs text-muted-foreground">({profileUser.reviewCount})</span>
                            </div>
                        ) : null}
                    </div>
                    {profileUser.studioId && profileUser.studioName && (
                      <Link href={`/${profileUser.studioName}`} className="text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5">
                        <Building className="w-4 h-4" /> {profileUser.studioName}
                      </Link>
                    )}
                    <div className="flex flex-wrap justify-center md:justify-start items-center gap-x-4 gap-y-1 mt-2 text-muted-foreground text-sm">
                      {profileUser.locationName && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{profileUser.locationName}</span>}
                      {profileUser.links?.instagram && (
                          <a href={profileUser.links.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary"><Instagram className="w-4 h-4" />Instagram</a>
                      )}
                      {profileUser.links?.whatsapp && (
                          <a href={profileUser.links.whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary"><MessageCircle className="w-4 h-4" />WhatsApp</a>
                      )}
                      {profileUser.links?.telegram && (
                          <a href={profileUser.links.telegram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary"><Send className="w-4 h-4" />Telegram</a>
                      )}
                      {profileUser.links?.twitter && (
                          <a href={profileUser.links.twitter} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary"><Twitter className="w-4 h-4" />Twitter</a>
                      )}
                      {profileUser.links?.portfolio && (
                          <a href={profileUser.links.portfolio} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary"><LinkIcon className="w-4 h-4" />Portfolio</a>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-center md:justify-end gap-2 shrink-0 mt-4 md:mt-0">
                    {canInteract && followStateDetermined && (
                        <>
                            <Button onClick={handleFollowToggle} disabled={isFollowLoading}>
                                {isFollowLoading ? (
                                    <Loader2 className="animate-spin" />
                                ) : isFollowing ? (
                                    <UserMinus />
                                ) : (
                                    <UserPlus />
                                )}
                                {isFollowing ? 'Unfollow' : 'Follow'}
                            </Button>
                            {canInteract && (currentUserProfile?.role === 'Administrator' || currentUserProfile?.role === 'Super-Administrator' || profileUser.role === 'Administrator' || profileUser.role === 'Super-Administrator') ? (
                                <Button variant="secondary" onClick={handleCreateChat} disabled={isCreatingChat}>
                                    {isCreatingChat ? <Loader2 className="animate-spin" /> : <MessageSquare />}
                                    Message
                                </Button>
                            ) : (
                                (profileUser.role === 'Tattoo Artist' || profileUser.role === 'Studio') && (profileUser.links?.whatsapp || profileUser.links?.telegram || profileUser.links?.instagram) && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="secondary">
                                                <MessageSquare className="w-4 h-4 mr-2" />
                                                Contact
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" sideOffset={6} collisionPadding={16} className="min-w-[190px] z-[100]">
                                            {profileUser.links?.whatsapp && (
                                                <DropdownMenuItem asChild>
                                                    <a href={profileUser.links.whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center cursor-pointer">
                                                        <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
                                                    </a>
                                                </DropdownMenuItem>
                                            )}
                                            {profileUser.links?.telegram && (
                                                <DropdownMenuItem asChild>
                                                    <a href={profileUser.links.telegram} target="_blank" rel="noopener noreferrer" className="flex items-center cursor-pointer">
                                                        <Send className="w-4 h-4 mr-2" /> Telegram
                                                    </a>
                                                </DropdownMenuItem>
                                            )}
                                            {profileUser.links?.instagram && (
                                                <DropdownMenuItem asChild>
                                                    <a href={profileUser.links.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center cursor-pointer">
                                                        <Instagram className="w-4 h-4 mr-2" /> Instagram
                                                    </a>
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )
                            )}
                        </>
                    )}
                    {isBookable && !isViewingAsSupplyStore && (
                        <Button variant="outline" onClick={() => canInteract ? setIsBookingDialogOpen(true) : toast({variant: 'destructive', title: 'You must be logged in to book.'})}>Book Now</Button>
                    )}
                  </div>
                </div>
            </div>
            
            <div className="mt-0 md:-mt-16 flex justify-center md:justify-start border-t border-border pt-4">
              <div className="flex gap-8 text-center">
                {profileUser.role !== 'Supply Store' && profileUser.role !== 'Client' && (
                  <div>
                    <p className="font-bold text-xl">{profileUser.artworksCount || 0}</p>
                    <p className="text-sm text-muted-foreground">Artworks</p>
                  </div>
                )}
                <div>
                   <button onClick={() => setFollowDialog({open: true, type: 'followers'})} className="text-left hover:text-primary transition-colors">
                        <p className="font-bold text-xl">{(profileUser.followersCount || 0).toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">Followers</p>
                    </button>
                </div>
                <div>
                    <button onClick={() => setFollowDialog({open: true, type: 'following'})} className="text-left hover:text-primary transition-colors">
                        <p className="font-bold text-xl">{(profileUser.followingCount || 0).toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">Following</p>
                    </button>
                </div>
              </div>
            </div>
          </div>
        </Card>
        </motion.div>

        <motion.div 
          variants={tabVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="w-full"
        >
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="justify-center">
            {tabs.map(tab => (
                <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>

          {tabs.some(t => t.value === 'stats') && (
              <TabsContent value="stats" className="mt-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <motion.div whileHover={{ y: -6, scale: 1.02 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                      <StatCard title="Points" value={profileUser.points?.toLocaleString() || 0} icon={Gem} />
                    </motion.div>
                    <motion.div whileHover={{ y: -6, scale: 1.02 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                      <StatCard title="Following" value={profileUser.followingCount?.toLocaleString() || 0} icon={Users} />
                    </motion.div>
                    <motion.div whileHover={{ y: -6, scale: 1.02 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                      <StatCard title="In Collection" value={profileUser.collectionCount?.toLocaleString() || 0} icon={LayoutGrid} />
                    </motion.div>
                    <motion.div whileHover={{ y: -6, scale: 1.02 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                      <StatCard title="Bookings" value={clientBookingsCount.toLocaleString() || 0} icon={BookUser} />
                    </motion.div>
                  </div>
              </TabsContent>
          )}
          
          {tabs.some(t => t.value === 'artworks') && (
              <TabsContent value="artworks" className="mt-6">
                {canViewProfile ? (
                  artworks.length > 0 ? (
                      <motion.div 
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                        className="columns-1 sm:columns-2 md:columns-3 gap-6 space-y-6"
                      >
                          {artworks.map((artwork) => (
                              <div key={artwork.id} className="break-inside-avoid-column">
                                <ArtworkCard artwork={artwork} currentUserProfile={currentUserProfile} />
                              </div>
                          ))}
                      </motion.div>
                  ) : (
                      <div className="text-center py-16 border-2 border-dashed rounded-lg">
                          <h2 className="text-2xl font-semibold text-muted-foreground">No artworks yet.</h2>
                          <p className="mt-2 text-muted-foreground">{profileUser.name} hasn't uploaded any art.</p>
                      </div>
                  )
                ) : (
                  <div className="text-center py-16 border-2 border-dashed rounded-lg">
                      <Lock className="mx-auto h-12 w-12 text-muted-foreground"/>
                      <h2 className="mt-4 text-2xl font-semibold text-muted-foreground">This Profile is Private</h2>
                      <p className="mt-2 text-muted-foreground">Follow {profileUser.name} to see their artworks.</p>
                  </div>
                )}
              </TabsContent>
          )}

          {tabs.some(t => t.value === 'products') && (
            <TabsContent value="products" className="mt-6">
                {products.length > 0 ? (
                    <motion.div 
                      variants={containerVariants}
                      initial="hidden"
                      animate="show"
                      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6"
                    >
                        {products.map(product => (
                          <motion.div key={product.id} variants={tabVariants} whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
                            <ProductCard product={product} />
                          </motion.div>
                        ))}
                    </motion.div>
                ) : (
                    <div className="text-center py-16 border-2 border-dashed rounded-lg">
                        <Package className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h2 className="mt-4 text-2xl font-semibold text-muted-foreground">No products yet.</h2>
                        <p className="mt-2 text-muted-foreground">{profileUser.name} hasn't listed any products.</p>
                    </div>
                )}
            </TabsContent>
          )}

           {tabs.some(t => t.value === 'artists') && (
                <TabsContent value="artists" className="mt-6">
                    {residentArtists.length > 0 ? (
                      <motion.div 
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6"
                      >
                          {residentArtists.map(artist => (
                              <motion.div key={artist.uid} variants={tabVariants} whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
                                <ArtistResultCard user={artist} />
                              </motion.div>
                          ))}
                      </motion.div>
                    ) : (
                       <div className="text-center py-16 border-2 border-dashed rounded-lg">
                          <h2 className="text-2xl font-semibold text-muted-foreground">No resident artists.</h2>
                          <p className="mt-2 text-muted-foreground">{profileUser.name} hasn't added any artists yet.</p>
                      </div>
                    )}
                </TabsContent>
           )}
           
            {tabs.some(t => t.value === 'reviews') && (
                <TabsContent value="reviews" className="mt-6">
                     {reviews.length > 0 ? (
                         <motion.div 
                           variants={containerVariants}
                           initial="hidden"
                           animate="show"
                           className="space-y-4"
                         >
                            {reviews.map(review => (
                                <motion.div key={review.id} variants={tabVariants}>
                                  <ReviewCard review={review} />
                                </motion.div>
                            ))}
                         </motion.div>
                    ) : (
                         <div className="text-center py-16 border-2 border-dashed rounded-lg">
                          <h2 className="text-2xl font-semibold text-muted-foreground">No reviews yet.</h2>
                          <p className="mt-2 text-muted-foreground">{profileUser.name} hasn't received any reviews.</p>
                      </div>
                    )}
                </TabsContent>
            )}

          <TabsContent value="about" className="mt-6">
              <Card>
                  <CardHeader>
                      <CardTitle className="font-headline text-xl">About {profileUser.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                      <p className="text-muted-foreground">{profileUser.bio}</p>
                  </CardContent>
              </Card>
          </TabsContent>
        </Tabs>
        </motion.div>
      </motion.div>
    </>
  );
}
