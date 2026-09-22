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
import { Heart, MessageCircle, Share2, User, UserPlus, AlertTriangle, Trash2, Pencil, Save, Cloud, Database, ExternalLink, ImageOff, Loader2 } from "lucide-react";
import type { Artwork } from '@/types/artwork';
import type { UserProfile, Notification, Comment } from '@/types/user';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { ArtworkActions } from '@/components/artwork/artwork-actions';
import { Textarea } from '@/components/ui/textarea';
import { formatDistanceToNow } from 'date-fns';
import { getTokenExplorerUrl, getIpfsGatewayUrl } from '@/lib/blockchain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function ArtworkDetailPage() {
  const params = useParams();
  const artworkId = params.id as string;
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [artist, setArtist] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<Partial<UserProfile> & { uid?: string } | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commenterProfiles, setCommenterProfiles] = useState<{[key: string]: Partial<UserProfile>}>({});
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [editingComment, setEditingComment] = useState<{ id: string; text: string } | null>(null);
  const [imageError, setImageError] = useState(false);
  const { toast } = useToast();

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

      try {
        const [artistSnapshot] = await Promise.all([artistPromise]);
        if (artistSnapshot.exists()) {
          setArtist({ uid: artistSnapshot.key, ...artistSnapshot.val() });
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
            if (!commenterProfiles[comment.userId]) {
                userIdsToFetch.push(comment.userId);
            }
        });
        setComments(commentsData.reverse());

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
        setIsLiked(false);
        setLikeCount(prev => prev - 1);
        toast({ variant: "destructive", title: "An error occurred." });
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
  const isSupplyStore = currentUserProfile?.role === 'Supply Store';

  const isOnChainPublished = !!artwork.isForSale || !!artwork.isDigitalAsset;
  const blockchainUrl = getTokenExplorerUrl(artwork.blockchain, artwork.contractAddress, artwork.tokenId);
  const ipfsUrl = artwork.ipfsGatewayUrl || getIpfsGatewayUrl(artwork.ipfsHash);
  const viewOnChainUrl = blockchainUrl || ipfsUrl;

  const handleViewOnChain = () => {
    if (!viewOnChainUrl || !artwork) {
      toast({ variant: 'destructive', title: 'Link Unavailable', description: 'This artwork has no blockchain reference yet.' });
      return;
    }
    window.open(viewOnChainUrl, '_blank', 'noopener,noreferrer');
  };

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
              unoptimized={
                artwork.imageUrl.startsWith('data:') ||
                artwork.imageUrl.includes('lh3.googleusercontent.com') ||
                artwork.imageUrl.startsWith('/uploads')
              }
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
                <Link href="/signup" className="text-primary underline">Sign up</Link> or <Link href="/login" className="text-primary underline">log in</Link> to view artist details.
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
                      href={blockchainUrl || artwork.ipfsGatewayUrl || getIpfsGatewayUrl(artwork.ipfsHash) || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      Ver en explorer <ExternalLink className="h-3 w-3" />
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
                    <p className="text-xs font-medium">Ownership verification failed. This item could not be verified on-chain.</p>
                 </div>
             )}
             {isOnChainPublished && (
                 <Button size="lg" className="w-full text-lg" onClick={handleViewOnChain} disabled={!viewOnChainUrl}>
                    {viewOnChainUrl ? <ExternalLink /> : <AlertTriangle />}
                    {viewOnChainUrl ? 'View on Blockchain' : 'Blockchain Link Unavailable'}
                 </Button>
             )}
            <p className="text-center text-xs text-muted-foreground mt-2">
              {isOnChainPublished
                ? (viewOnChainUrl
                    ? "Opens the published artwork on its blockchain explorer. Inkfinity does not handle NFT transactions."
                    : "This artwork has no blockchain reference yet.")
                : ""}
            </p>
        </div>
      </div>
    </div>
  );
}