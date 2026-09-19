// src/components/artwork-card.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import type { Artwork } from "@/types/artwork";
import { Card, CardFooter, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, User, Cloud, Database, ImageOff, Gem } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { auth, database } from "@/lib/firebase-config";
import { ref, update, increment, onValue, push, serverTimestamp, get } from "firebase/database";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import type { UserProfile, Notification } from "@/types/user";
import { motion } from "framer-motion";

type ArtworkCardProps = {
  artwork: Artwork;
  currentUserProfile: UserProfile | null;
};

export default function ArtworkCard({ artwork, currentUserProfile }: ArtworkCardProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(artwork.likesCount || 0);
  const [imageError, setImageError] = useState(false);
  const { toast } = useToast();
  const [artistAvatar, setArtistAvatar] = useState(artwork.artistAvatarUrl);

  useEffect(() => {
    if (currentUserProfile && currentUserProfile.likedArtworks) {
      setIsLiked(!!currentUserProfile.likedArtworks[artwork.id]);
    } else {
      setIsLiked(false);
    }
  }, [currentUserProfile, artwork.id]);


  useEffect(() => {
    setLikeCount(artwork.likesCount || 0);
  }, [artwork.likesCount]);
  
  useEffect(() => {
    // If the artwork object already has a modern storage URL, we can trust it.
    if (artistAvatar && artistAvatar.startsWith('https')) {
        return;
    }
    
    // If the avatar URL is missing or looks like a data URI, fetch the fresh one.
    let isMounted = true;
    get(ref(database, `users/${artwork.artistId}`)).then(snapshot => {
        if (isMounted && snapshot.exists() && snapshot.val().avatarUrl) {
            setArtistAvatar(snapshot.val().avatarUrl);
        }
    }).catch(console.error);

    return () => { isMounted = false; }
  }, [artwork.artistId, artistAvatar]);


  const handleLikeClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUserProfile) {
      toast({ variant: 'destructive', title: 'Please log in to like artwork.' });
      return;
    }
    
    if (isLiked) {
        return;
    }

    if (currentUser.uid === artwork.artistId) {
      toast({ variant: 'destructive', title: 'You cannot like your own artwork.' });
      return;
    }

    setIsLiked(true);
    setLikeCount(prev => prev + 1);

    const updates: { [key: string]: any } = {};
    updates[`/artworks/${artwork.id}/likes/${currentUser.uid}`] = true;
    updates[`/artworks/${artwork.id}/likesCount`] = increment(1);
    updates[`/users/${currentUser.uid}/likedArtworks/${artwork.id}`] = true;
    updates[`/users/${artwork.artistId}/points`] = increment(10);

    const notificationsRef = ref(database, `users/${artwork.artistId}/notifications`);
    const notificationId = push(notificationsRef).key;

    if (notificationId) {
      const newNotification: Omit<Notification, 'id'> = {
        type: 'like',
        fromUserId: currentUser.uid,
        fromUserName: currentUserProfile.name || 'A user',
        message: `${currentUserProfile.name || 'A new user'} liked your artwork: "${artwork.title}".`,
        isRead: false,
        createdAt: serverTimestamp(),
        link: `/artwork/${artwork.id}`
      };
      updates[`/users/${artwork.artistId}/notifications/${notificationId}`] = newNotification;
    }

    try {
      await update(ref(database), updates);
    } catch (error) {
      console.error("Like transaction failed: ", error);
      setIsLiked(false);
      setLikeCount(prev => prev - 1);
      toast({ variant: "destructive", title: "An error occurred." });
    }
  };

  const isSupplyStore = currentUserProfile?.role === 'Supply Store';
  const isAdmin = currentUserProfile?.role === 'Administrator' || currentUserProfile?.role === 'Super-Administrator';

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div 
      variants={item}
      whileHover={{ y: -8, transition: { duration: 0.2 } }}
      className="h-full"
    >
      <Card className="h-full group overflow-hidden border-2 border-primary/10 hover:border-primary/50 transition-colors duration-300 shadow-sm hover:shadow-xl hover:shadow-primary/20">
      <CardContent className="p-0">
        <Link href={`/artwork/${artwork.id}`}>
            <div className="aspect-[3/4] relative bg-muted rounded-t-lg overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
              {!imageError && artwork.imageUrl ? (
                <Image
                  src={artwork.imageUrl}
                  alt={artwork.title}
                  fill
                  onError={() => setImageError(true)}
                  className="transition-transform duration-300 group-hover:scale-105"
                  style={{ objectFit: "contain" }}
                  data-ai-hint={artwork.dataAiHint}
                  unoptimized={
                    artwork.imageUrl.startsWith('data:') ||
                    artwork.imageUrl.includes('lh3.googleusercontent.com') ||
                    artwork.imageUrl.startsWith('/uploads')
                  }
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-muted/60 text-muted-foreground gap-2">
                  <ImageOff className="h-8 w-8 text-muted-foreground/60" />
                  <p className="text-xs line-clamp-2 px-2 font-medium">{artwork.title}</p>
                </div>
              )}
              <div className="absolute inset-0 bg-transparent"></div>

              {/* Storage indicator tag */}
              <div className="absolute top-2 left-2 flex gap-1 z-10">
                {artwork.storageType === 'google-drive' && (
                  <span className="bg-background/85 backdrop-blur-sm text-foreground text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm font-medium border border-border">
                    <Cloud className="w-2.5 h-2.5 text-blue-500" /> Drive
                  </span>
                )}
                {(artwork.storageType === 'ipfs' || artwork.isDigitalAsset) && (
                  <span className="bg-background/85 backdrop-blur-sm text-foreground text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm font-medium border border-border">
                    <Gem className="w-2.5 h-2.5 text-purple-500" /> IPFS
                  </span>
                )}
              </div>
            </div>
        </Link>
      </CardContent>
      <CardHeader className="p-4">
        <div className="flex justify-between items-start">
            <div className="flex-1 overflow-hidden">
                <CardTitle className="font-headline text-lg truncate text-foreground">
                    <Link href={`/artwork/${artwork.id}`} className="hover:text-primary transition-colors">
                    {artwork.title}
                    </Link>
                </CardTitle>
                 <div className="flex items-center gap-2 mt-1">
                    <Avatar className="h-6 w-6">
                        <AvatarImage src={artistAvatar} />
                        <AvatarFallback><User className="h-4 w-4"/></AvatarFallback>
                    </Avatar>
                    <p className="text-sm text-muted-foreground truncate">
                        <Link href={`/${artwork.artistUsername}`} className="hover:underline text-primary/80">{artwork.artistName}</Link>
                    </p>
                </div>
            </div>
            {!isSupplyStore && !isAdmin && (
                 <div className="flex items-center gap-1 pl-2">
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-accent w-8 h-8" onClick={handleLikeClick} disabled={isLiked}>
                        <Heart className={cn("w-5 h-5", isLiked && "fill-accent text-accent")} />
                    </Button>
                    <span className="text-sm text-muted-foreground">{likeCount}</span>
                </div>
            )}
        </div>
      </CardHeader>
    </Card>
    </motion.div>
  );
}
