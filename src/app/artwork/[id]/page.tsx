// src/app/artwork/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Image from "next/image";
import Link from "next/link";
import { database, auth } from '@/lib/firebase-config';
import { ref, get, onValue, update, push, serverTimestamp, query, orderByChild, set, remove, increment } from 'firebase/database';
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Heart, MessageCircle, Share2, Wallet, Loader2, User, UserPlus, AlertTriangle, History, ArrowRight, Trash2, CheckCheck, Clock, Pencil, Save, Cloud, Database, ExternalLink, ImageOff, Gem } from "lucide-react";
import type { Artwork, SaleRecord } from '@/types/artwork';
import type { UserProfile, Notification, Comment } from '@/types/user';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { ArtworkActions } from '@/components/artwork/artwork-actions';
import { Textarea } from '@/components/ui/textarea';
import { format, formatDistanceToNow } from 'date-fns';
import { useWallet } from '@/context/wallet-provider';
import { parseEther, parseUnits } from 'ethers';
import { getCryptoPrice } from '@/ai/flows/get-crypto-price-flow';
import { verifyNftOwnership } from '@/ai/flows/verify-nft-ownership-flow';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';

type EnrichedSaleRecord = SaleRecord & {
    fromOwner?: UserProfile;
    toOwner?: UserProfile;
};

export default function ArtworkDetailPage() {
  const params = useParams();
  const router = useRouter();
  const artworkId = params.id as string;
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [saleHistory, setSaleHistory] = useState<EnrichedSaleRecord[]>([]);
  const [artist, setArtist] = useState<UserProfile | null>(null);
  const [owner, setOwner] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<Partial<UserProfile> & { uid?: string } | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commenterProfiles, setCommenterProfiles] = useState<{[key: string]: Partial<UserProfile>}>({});
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [editingComment, setEditingComment] = useState<{ id: string; text: string } | null>(null);
  const [imageError, setImageError] = useState(false);
  const { toast } = useToast();
  const { provider, connectWallet, isConnected, walletAddress } = useWallet();
  const { settings } = usePlatformSettings();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        const userRef = ref(database, `users/${user.uid}`);
        const unsubscribeUser = onValue(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            setCurrentUserProfile({ uid: user.uid, ...data });
            setIsLiked(!!(data.likedArtworks && data.likedArtworks[artworkId]));
          }
        });
         return () => unsubscribeUser();
      } else {
        setCurrentUserProfile(null);
        setIsLiked(false);
      }
    });
    return () => unsubscribeAuth();
  }, [artworkId]);
  
  useEffect(() => {
    if (!artworkId) return;

    setLoading(true);
    setError(null);
    
    getCryptoPrice({ cryptoSymbol: 'ETH' }).then(result => {
        setEthPrice(result.priceUsd);
    });

    const artworkRef = ref(database, `artworks/${artworkId}`);
    
    const unsubscribeArtwork = onValue(artworkRef, async (artworkSnapshot) => {
      if (!artworkSnapshot.exists()) {
        setError('Artwork not found.');
        setLoading(false);
        return;
      }

      const artworkData = { id: artworkSnapshot.key, ...artworkSnapshot.val() } as Artwork;
      setArtwork(artworkData);
      setLikeCount(artworkData.likesCount || 0);

      const artistPromise = get(ref(database, `users/${artworkData.artistId}`));
      const ownerPromise = get(ref(database, `users/${artworkData.ownerId}`));

      try {
        const [artistSnapshot, ownerSnapshot] = await Promise.all([artistPromise, ownerPromise]);
        if (artistSnapshot.exists()) {
          setArtist({ uid: artistSnapshot.key, ...artistSnapshot.val() });
        }
        if (ownerSnapshot.exists()) {
            setOwner({ uid: ownerSnapshot.key, ...ownerSnapshot.val() });
        }

        if (artworkData.saleHistory) {
            const history: SaleRecord[] = Object.values(artworkData.saleHistory).sort((a,b) => b.timestamp - a.timestamp);
            const enrichedHistoryPromises = history.map(async (sale) => {
                const fromOwnerSnap = await get(ref(database, `users/${sale.fromOwnerId}`));
                const toOwnerSnap = await get(ref(database, `users/${sale.toOwnerId}`));
                return {
                    ...sale,
                    fromOwner: fromOwnerSnap.exists() ? fromOwnerSnap.val() : undefined,
                    toOwner: toOwnerSnap.exists() ? toOwnerSnap.val() : undefined,
                };
            });
            const enrichedHistory = await Promise.all(enrichedHistoryPromises);
            setSaleHistory(enrichedHistory);
        }

      } catch (err) {
          console.warn("Could not fetch user details:", err);
      }
       
       setLoading(false);
    }, (err) => {
      console.error("Error fetching artwork data:", err);
      setError('Failed to fetch artwork data.');
      setLoading(false);
    });

    // Fetch comments and their author profiles
    const commentsRef = query(ref(database, `comments/${artworkId}`), orderByChild('createdAt'));
    const unsubscribeComments = onValue(commentsRef, (snapshot) => {
        const commentsData: Comment[] = [];
        const userIdsToFetch: string[] = [];
        snapshot.forEach(childSnapshot => {
            const comment = { id: childSnapshot.key!, ...childSnapshot.val() };
            commentsData.push(comment);
            // Collect user IDs that we don't have a profile for yet
            if (!commenterProfiles[comment.userId]) {
                userIdsToFetch.push(comment.userId);
            }
        });
        setComments(commentsData.reverse());

        // Fetch profiles for new commenters
        const uniqueUserIds = [...new Set(userIdsToFetch)];
        if (uniqueUserIds.length > 0) {
            const profilePromises = uniqueUserIds.map(id => get(ref(database, `users/${id}`)));
            Promise.all(profilePromises).then(profileSnapshots => {
                const newProfiles: { [key: string]: Partial<UserProfile> } = {};
                profileSnapshots.forEach(snap => {
                    if (snap.exists()) {
                        newProfiles[snap.key!] = snap.val();
                    }
                });
                setCommenterProfiles(prev => ({ ...prev, ...newProfiles }));
            });
        }
    });


    return () => {
      unsubscribeArtwork();
      unsubscribeComments();
    };
  }, [artworkId]);

  const handleLikeClick = async () => {
    if (!currentUser || !currentUserProfile?.uid || !artwork) {
        toast({ variant: 'destructive', title: 'Please log in to like artwork.'});
        return;
    }

    if (isLiked) {
        return;
    }

    if (currentUser.uid === artwork?.artistId) {
        toast({ variant: 'destructive', title: 'You cannot like your own artwork.'});
        return;
    }
    
    // Optimistically update the UI
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
            link: `/artwork/${artworkId}`
        };
        updates[`/users/${artwork.artistId}/notifications/${notificationId}`] = newNotification;
    }
    
    try {
        await update(ref(database), updates);
    } catch (error) {
        console.error("Like transaction failed: ", error);
        // Revert optimistic UI update on error
        setIsLiked(false);
        setLikeCount(prev => prev - 1);
        toast({ variant: "destructive", title: "An error occurred." });
    }
  };
  
  const handlePurchase = async () => {
    if (!currentUser || !currentUserProfile || !artwork || !artwork.isForSale || typeof artwork.price !== 'number' || !ethPrice) {
        toast({ variant: 'destructive', title: 'This artwork is not for sale.'});
        return;
    }
    if (!isConnected || !provider) {
        toast({ variant: 'destructive', title: 'Wallet Not Connected', description: 'Please connect your wallet to pay.' });
        connectWallet();
        return;
    }
    if (currentUser.uid === artwork.ownerId) {
        toast({ variant: 'destructive', title: 'You already own this artwork.'});
        return;
    }
    if (!owner?.walletAddress) {
        toast({ variant: 'destructive', title: 'Owner Not Ready', description: 'The current owner has not configured their wallet for payments.' });
        return;
    }

    setIsProcessing(true);

    try {
        const priceInEth = artwork.price / ethPrice;
        const signer = await provider.getSigner();
        
        const txParams: { to: string, value: bigint, maxPriorityFeePerGas?: bigint, maxFeePerGas?: bigint } = {
            to: owner.walletAddress,
            value: parseEther(priceInEth.toFixed(18)),
        };

        if (settings?.network === 'amoy') {
            const fee = parseUnits('30', 'gwei');
            txParams.maxPriorityFeePerGas = fee;
            txParams.maxFeePerGas = fee;
        }

        const tx = await signer.sendTransaction(txParams);
        
        toast({ title: "Transaction Sent", description: "Waiting for blockchain confirmation..." });
        await tx.wait();

        const updates: {[key: string]: any} = {};
        
        // 1. Update artwork status to awaiting delivery
        updates[`/artworks/${artwork.id}/moderationStatus`] = 'awaiting_delivery';
        updates[`/artworks/${artwork.id}/buyerId`] = currentUser.uid;
        updates[`/artworks/${artwork.id}/isForSale`] = false; // Mark as no longer for sale
        
        // 2. Create notifications for both buyer and seller
        const sellerNotificationRef = push(ref(database, `users/${artwork.ownerId}/notifications`));
        updates[`/users/${artwork.ownerId}/notifications/${sellerNotificationRef.key}`] = {
            type: 'sale',
            fromUserId: currentUser.uid,
            fromUserName: currentUserProfile.name || 'A user',
            message: `Payment received for "${artwork.title}". Please transfer the NFT to the buyer.`,
            isRead: false,
            createdAt: serverTimestamp(),
            link: `/artwork/${artwork.id}`
        };

        const buyerNotificationRef = push(ref(database, `users/${currentUser.uid}/notifications`));
        updates[`/users/${currentUser.uid}/notifications/${buyerNotificationRef.key}`] = {
            type: 'sale',
            fromUserId: artwork.ownerId,
            fromUserName: artwork.ownerName || 'Seller',
            message: `Payment sent for "${artwork.title}". Awaiting NFT delivery from the seller.`,
            isRead: false,
            createdAt: serverTimestamp(),
            link: `/artwork/${artwork.id}`
        };

        // 3. Execute all updates
        await update(ref(database), updates);

        toast({
            title: 'Payment Successful!',
            description: `The seller has been notified. Please wait for them to transfer the NFT.`
        });

    } catch (error: any) {
        console.error("Purchase failed:", error);
        if (error.code === 'INSUFFICIENT_FUNDS') {
            toast({ variant: 'destructive', title: 'Insufficient Funds', description: 'You do not have enough ETH in your wallet to complete this transaction.' });
        } else if (error.code === 'CALL_EXCEPTION') {
             toast({ variant: 'destructive', title: 'Transaction Failed', description: 'The transaction is likely to fail. Please check your wallet balance and network, then try again.' });
        } else {
            toast({ variant: 'destructive', title: 'Purchase Failed', description: error?.reason || 'The transaction could not be completed.'});
        }
    } finally {
        setIsProcessing(false);
    }
  };

  const handleConfirmDelivery = async () => {
    if (!currentUser || !currentUserProfile || !currentUserProfile.walletAddress || !artwork || !artwork.contractAddress || !artwork.tokenId) {
        toast({ variant: 'destructive', title: 'Error', description: 'Missing required information to confirm delivery.'});
        return;
    }

    setIsProcessing(true);

    try {
        const verification = await verifyNftOwnership({
            walletAddress: currentUserProfile.walletAddress,
            tokenId: artwork.tokenId,
            contractAddress: artwork.contractAddress,
        });

        if (!verification.isOwner) {
            toast({ variant: 'destructive', title: 'NFT Not Received', description: 'We could not verify that the NFT is in your wallet. Please try again after the transfer is complete on the blockchain.' });
            setIsProcessing(false);
            return;
        }

        // NFT is confirmed in buyer's wallet, finalize the sale.
        const saleRecordRef = push(ref(database, `artworks/${artwork.id}/saleHistory`));
        const saleRecord: SaleRecord = {
          price: artwork.price!,
          timestamp: serverTimestamp(),
          fromOwnerId: artwork.ownerId,
          toOwnerId: currentUser.uid,
        };

        const updates: {[key: string]: any} = {};
        updates[`/artworks/${artwork.id}/saleHistory/${saleRecordRef.key}`] = saleRecord;
        updates[`/artworks/${artwork.id}/ownerId`] = currentUser.uid;
        updates[`/artworks/${artwork.id}/ownerName`] = currentUserProfile.name || 'Anonymous';
        updates[`/artworks/${artwork.id}/moderationStatus`] = 'approved';
        updates[`/artworks/${artwork.id}/buyerId`] = null;
        updates[`/users/${currentUser.uid}/collectionCount`] = increment(1);

        await update(ref(database), updates);
        
        toast({ title: 'Delivery Confirmed!', description: `You are now the new owner of "${artwork.title}".` });
        router.push('/collection');

    } catch(error: any) {
        console.error('Confirmation error:', error);
        toast({ variant: 'destructive', title: 'Confirmation Failed', description: 'An unexpected error occurred.' });
    } finally {
        setIsProcessing(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: artwork?.title || "Inkfinity Artwork",
          text: `Check out this artwork by ${artist?.name || 'an artist'} on Inkfinity!`,
          url: window.location.href,
        });
        toast({ title: 'Shared successfully!' });
      } catch (error) {
        console.error('Error sharing:', error);
        toast({ variant: 'destructive', title: 'Could not share', description: 'An error occurred while trying to share.' });
      }
    } else {
      // Fallback for browsers that do not support the Web Share API
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast({ title: 'Link Copied!', description: 'Artwork link has been copied to your clipboard.' });
      } catch (error) {
        toast({ variant: 'destructive', title: 'Could not copy link' });
      }
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUser || !currentUserProfile) {
        toast({ variant: 'destructive', title: 'Please log in and write a comment.'});
        return;
    }

    setIsSubmittingComment(true);
    const commentsRef = ref(database, `comments/${artworkId}`);
    const newCommentRef = push(commentsRef);

    const commentData: Omit<Comment, 'id'> = {
        userId: currentUser.uid,
        userName: currentUserProfile.name || 'Anonymous',
        userAvatar: currentUserProfile.avatarUrl || '',
        text: newComment,
        createdAt: serverTimestamp(),
    };
    
    const artworkCommentsCountRef = ref(database, `artworks/${artworkId}/commentsCount`);

    try {
        await set(newCommentRef, commentData);
        await update(artworkCommentsCountRef.parent!, { commentsCount: increment(1) });

        setNewComment('');
        toast({ title: 'Comment posted!' });
    } catch (error) {
        console.error('Comment submission error:', error);
        toast({ variant: 'destructive', title: 'Could not post comment.' });
    } finally {
        setIsSubmittingComment(false);
    }
  };
  
   const handleDeleteComment = async (commentId: string) => {
    if (!currentUserProfile || !artwork) return;

    try {
      await remove(ref(database, `comments/${artworkId}/${commentId}`));
      await update(ref(database, `artworks/${artworkId}`), { commentsCount: increment(-1) });
      toast({ title: 'Comment Deleted' });
    } catch (error: any) {
      console.error('Comment deletion error:', error);
      toast({ variant: 'destructive', title: 'Could not delete comment.', description: error.message });
    }
  };
  
  const handleUpdateComment = async (commentId: string) => {
    if (!editingComment || editingComment.id !== commentId || !editingComment.text.trim()) {
        return;
    }

    try {
      await update(ref(database, `comments/${artworkId}/${commentId}`), { text: editingComment.text });
      toast({ title: 'Comment Updated' });
      setEditingComment(null);
    } catch (error: any) {
      console.error('Comment update error:', error);
      toast({ variant: 'destructive', title: 'Could not update comment.', description: error.message });
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
      </div>
    );
  }

  if (!artwork) {
    return null; // or a fallback component
  }

  const isAdmin = currentUserProfile?.role === 'Administrator' || currentUserProfile?.role === 'Super-Administrator';
  const isOwner = currentUserProfile?.uid === artwork.ownerId;
  const isArtist = currentUserProfile?.uid === artwork.artistId;
  const isBuyer = currentUserProfile?.uid === artwork.buyerId;
  const isSupplyStore = currentUserProfile?.role === 'Supply Store';
  const canEdit = isOwner;
  const canPurchase = artwork.isForSale && !artwork.ownershipMismatch && !!currentUser && !isAdmin && !isOwner;
  const priceInEth = ethPrice && artwork.price ? (artwork.price / ethPrice).toFixed(4) : '...';

  const getPurchaseButtonText = () => {
    if (!ethPrice) return 'Loading Price...';
    if (artwork.moderationStatus === 'awaiting_delivery') return 'Awaiting Delivery';
    if (!artwork.isForSale) return 'Not for Sale';
    if (artwork.ownershipMismatch) return 'Listing Unavailable';
    if (!currentUser) return 'Log in to purchase';
    if (isAdmin) return 'Administrators cannot purchase';
    if (isOwner) return 'You own this asset';
    if (!owner?.walletAddress) return 'Owner wallet not set';
    return `Buy - $${artwork.price} (~${priceInEth} ETH)`;
  }

  return (
    <div className="grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-8">
        <div className="aspect-[4/3] relative rounded-lg overflow-hidden border-2 border-primary/20 shadow-lg shadow-primary/10 bg-muted" onContextMenu={(e) => e.preventDefault()}>
          {!imageError && artwork.imageUrl ? (
            <Image
              src={artwork.imageUrl}
              alt={artwork.title}
              fill
              onError={() => setImageError(true)}
              className="object-contain"
              unoptimized={artwork.imageUrl.startsWith('data:') || artwork.imageUrl.includes('lh3.googleusercontent.com')}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-muted text-muted-foreground gap-3">
              <ImageOff className="h-16 w-16 text-muted-foreground/50" />
              <p className="font-semibold text-lg text-foreground">{artwork.title}</p>
              <p className="text-xs text-muted-foreground max-w-sm">Vista previa no disponible para esta obra histórica.</p>
            </div>
          )}
          <div className="absolute inset-0 bg-transparent"></div>
        </div>

        {/* Provenance Section */}
        {artwork.isDigitalAsset && saleHistory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2">
                <History /> Provenance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {saleHistory.map((sale, index) => (
                <div key={index} className="flex items-center gap-4 text-sm">
                  {sale.fromOwner ? (
                      <Link href={`/${sale.fromOwner.username}`} className="flex items-center gap-2 hover:text-primary">
                        <Avatar className="h-8 w-8"><AvatarImage src={sale.fromOwner.avatarUrl} /><AvatarFallback><User /></AvatarFallback></Avatar>
                        <span>{sale.fromOwner.name}</span>
                      </Link>
                  ) : <span>Previous Owner</span>}
                  
                  <div className="flex-grow text-center">
                    <ArrowRight className="h-4 w-4 mx-auto text-muted-foreground"/>
                    <p className="text-xs text-muted-foreground">${sale.price.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(sale.timestamp), 'PP')}</p>
                  </div>

                  {sale.toOwner ? (
                      <Link href={`/${sale.toOwner.username}`} className="flex items-center gap-2 hover:text-primary">
                        <Avatar className="h-8 w-8"><AvatarImage src={sale.toOwner.avatarUrl} /><AvatarFallback><User /></AvatarFallback></Avatar>
                        <span>{sale.toOwner.name}</span>
                      </Link>
                  ) : <span>New Owner</span>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Comments Section */}
        <div className="space-y-6">
            <h2 className="font-headline text-2xl">Comments ({artwork.commentsCount || 0})</h2>
            
            {!isSupplyStore && (
                <form onSubmit={handleCommentSubmit}>
                    <div className="flex items-start space-x-4">
                        <Avatar>
                            <AvatarImage src={currentUserProfile?.avatarUrl || undefined} />
                            <AvatarFallback><User /></AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <Textarea 
                            placeholder="Add a comment..." 
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            disabled={!currentUser || isSubmittingComment}
                            />
                            <div className="mt-2 flex justify-end">
                                <Button type="submit" disabled={!newComment.trim() || isSubmittingComment}>
                                {isSubmittingComment && <Loader2 className="animate-spin"/>}
                                Post Comment
                                </Button>
                            </div>
                        </div>
                    </div>
                </form>
            )}

            <div className="space-y-4">
               {comments.map(comment => {
                    const canEditComment = currentUserProfile && currentUserProfile.uid === comment.userId;
                    const canDeleteComment = canEditComment || isOwner || isAdmin;
                    const isEditing = editingComment?.id === comment.id;
                    const commenterAvatarUrl = commenterProfiles[comment.userId]?.avatarUrl || comment.userAvatar;

                    return (
                       <div key={comment.id} className="flex items-start space-x-4 group">
                           <Avatar>
                               <AvatarImage src={commenterAvatarUrl} />
                               <AvatarFallback>{comment.userName.charAt(0)}</AvatarFallback>
                           </Avatar>
                           <div className="min-w-0 flex-1">
                               <p>
                                   <Link href={`/${comment.userName}`} className="font-semibold text-sm hover:underline">{comment.userName}</Link>
                                   <time className="text-xs text-muted-foreground ml-2">
                                       {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                                   </time>
                               </p>
                               {isEditing ? (
                                <div className="mt-2 space-y-2">
                                    <Input
                                        value={editingComment.text}
                                        onChange={(e) => setEditingComment({ ...editingComment, text: e.target.value })}
                                        className="text-sm"
                                    />
                                    <div className="flex gap-2">
                                        <Button size="sm" onClick={() => handleUpdateComment(comment.id)}><Save className="h-4 w-4 mr-1"/>Save</Button>
                                        <Button size="sm" variant="ghost" onClick={() => setEditingComment(null)}>Cancel</Button>
                                    </div>
                                </div>
                               ) : (
                                <p className="text-sm text-foreground">{comment.text}</p>
                               )}
                           </div>
                           <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {canEditComment && !isEditing && (
                                 <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingComment({id: comment.id, text: comment.text})}>
                                    <Pencil className="h-4 w-4" />
                                </Button>
                            )}
                           {canDeleteComment && (
                                <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteComment(comment.id)}
                                >
                                <Trash2 className="h-4 w-4" />
                                </Button>
                           )}
                           </div>
                       </div>
                    );
                })}
            </div>
        </div>
      </div>
      <div className="lg:col-span-1 space-y-6">
        <div className="flex justify-between items-start">
          <h1 className="text-4xl font-headline font-bold">{artwork.title}</h1>
          {artwork && <ArtworkActions artwork={artwork} />}
        </div>
        
        {artist ? (
            <div className="mt-2">
            <Link href={`/${artist.username}`} className="flex items-center gap-3 group">
                <Avatar>
                <AvatarImage src={artist.avatarUrl} alt={artist.name} />
                <AvatarFallback><User /></AvatarFallback>
                </Avatar>
                <div>
                <p className="font-semibold text-lg group-hover:text-primary transition-colors">{artist.name}</p>
                <p className="text-sm text-muted-foreground">@{artist.username}</p>
                </div>
            </Link>
            </div>
        ) : (
            <div className="mt-4 p-4 rounded-lg bg-card border border-primary/20 text-center">
                <UserPlus className="mx-auto h-8 w-8 text-primary" />
                <h3 className="mt-2 font-semibold">Join to see more!</h3>
                <p className="text-sm text-muted-foreground">
                <Link href="/signup" className="text-primary underline">Sign up</Link> or <Link href="/login" className="text-primary underline">log in</Link> to view artist details and purchase this artwork.
                </p>
            </div>
        )}

        {artwork.tags && artwork.tags.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-headline text-lg">Details</h2>
            <div className="flex flex-wrap gap-2">
              {artwork.tags.map(tag => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          </div>
        )}
        
        <div className="space-y-2">
            <h2 className="font-headline text-lg">Description</h2>
            <p className="text-muted-foreground">
                {artwork.description}
            </p>
        </div>

        {/* Storage & Provenance details */}
        {(artwork.storageType === 'google-drive' || artwork.googleDriveFileId || artwork.storageType === 'ipfs' || artwork.ipfsHash) && (
          <div className="rounded-lg border p-3.5 bg-card/60 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Almacenamiento Verificado</h3>
            {artwork.storageType === 'google-drive' || artwork.googleDriveFileId ? (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-foreground font-medium">
                  <Cloud className="h-4 w-4 text-blue-500" />
                  Google Drive (Carpeta Inkfinity Artworks)
                </span>
                {artwork.googleDriveViewUrl && (
                  <a
                    href={artwork.googleDriveViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    Ver archivo <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ) : null}

            {artwork.storageType === 'ipfs' || artwork.ipfsHash ? (
              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-foreground font-medium">
                    <Database className="h-4 w-4 text-purple-500" />
                    IPFS Descentralizado (Web3)
                  </span>
                  {artwork.ipfsHash && (
                    <a
                      href={`https://ipfs.io/ipfs/${artwork.ipfsHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      Gateway IPFS <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {artwork.ipfsHash && (
                  <p className="text-[11px] font-mono text-muted-foreground truncate">
                    CID: {artwork.ipfsHash}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}

        <div className="flex items-center space-x-4 text-muted-foreground">
            {!isSupplyStore && !isAdmin && (
                <Button variant="ghost" className="flex items-center gap-2" onClick={handleLikeClick} disabled={isLiked}>
                    <Heart className={cn("w-5 h-5", isLiked && "fill-accent text-accent")}/> {likeCount}
                </Button>
            )}
            <Button variant="ghost" className="flex items-center gap-2"><MessageCircle className="w-5 h-5"/> {artwork.commentsCount || 0}</Button>
            <Button variant="ghost" className="flex items-center gap-2" onClick={handleShare}><Share2 className="w-5 h-5"/> Share</Button>
        </div>

        <div className="border-t border-border pt-6">
             {artwork.ownershipMismatch && (
                 <div className="mb-4 p-3 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    <p className="text-xs font-medium">Ownership verification failed. This item is temporarily unavailable.</p>
                 </div>
             )}
             {artwork.moderationStatus === 'awaiting_delivery' ? (
                isBuyer ? (
                     <Button size="lg" className="w-full text-lg" onClick={handleConfirmDelivery} disabled={isProcessing}>
                        {isProcessing ? <Loader2 className="animate-spin" /> : <CheckCheck />}
                        {isProcessing ? 'Confirming...' : 'Confirm Delivery'}
                     </Button>
                ) : (
                    <Button size="lg" className="w-full text-lg" disabled={true} variant="outline">
                        <Clock className="mr-2" />
                        Awaiting Buyer Confirmation
                    </Button>
                )
             ) : (
                artwork.isForSale && (
                  <Button size="lg" className="w-full text-lg" disabled={!canPurchase || isProcessing || !owner?.walletAddress || !ethPrice} onClick={handlePurchase}>
                      {isProcessing ? <Loader2 className="animate-spin" /> : <Wallet />}
                      {isProcessing ? 'Processing...' : getPurchaseButtonText()}
                  </Button>
                )
             )}
            <p className="text-center text-xs text-muted-foreground mt-2">
              {canPurchase ? "By purchasing, you acquire this digital asset." : (artwork.isForSale ? "This asset is not available for you to purchase at this time." : "")}
            </p>
        </div>
      </div>
    </div>
  );
}
