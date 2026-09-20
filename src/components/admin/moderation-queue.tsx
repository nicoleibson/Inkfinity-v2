// src/components/admin/moderation-queue.tsx
"use client";

import { useEffect, useState } from "react";
import { database, auth } from "@/lib/firebase-config";
import { ref, onValue, query, orderByChild, equalTo, remove, update, increment, get, push, set } from "firebase/database";
import type { UserProfile } from "@/types/user";
import type { Artwork } from "@/types/artwork";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Loader2, User, Image as ImageIcon, AlertTriangle, Info } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import Image from "next/image";
import Link from "next/link";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type ModerationItem = Artwork & { reporterProfile?: Partial<UserProfile> };

export function ModerationQueue() {
  const [queue, setQueue] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);
  const [isConfirming, setIsConfirming] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userRef = ref(database, `users/${user.uid}`);
        get(userRef).then(snapshot => {
            if(snapshot.exists()) {
                const profile = {uid: user.uid, ...snapshot.val()};
                setCurrentUserProfile(profile);
                if (profile.role !== 'Super-Administrator') {
                    setError("You do not have permission to view this page.");
                    setLoading(false);
                }
            }
        });
      } else {
        setError("You are not authorized to view this page.");
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (currentUserProfile?.role !== 'Super-Administrator') return;

    const artworksRef = query(ref(database, 'artworks'), orderByChild('moderationStatus'), equalTo('pending_deletion'));

    const unsubscribe = onValue(artworksRef, (snapshot) => {
      if (snapshot.exists()) {
        const queueData: ModerationItem[] = [];
        snapshot.forEach(childSnapshot => {
          queueData.push({ id: childSnapshot.key as string, ...childSnapshot.val() });
        });
        setQueue(queueData);
      } else {
        setQueue([]);
      }
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError("Permission denied. You must be a Super-Administrator to view this data.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUserProfile]);

  const handleActionConfirm = async () => {
    if (!selectedArtwork || !isConfirming) return;

    setProcessingId(selectedArtwork.id);
    
    if (isConfirming === 'approve') {
      await handleApproveDeletion(selectedArtwork);
    } else {
      await handleRejectDeletion(selectedArtwork);
    }

    setProcessingId(null);
    setIsConfirming(null);
    setSelectedArtwork(null);
  };


  const handleApproveDeletion = async (artwork: Artwork) => {
    try {
        await remove(ref(database, `artworks/${artwork.id}`));
        await update(ref(database, `users/${artwork.artistId}`), {
            artworksCount: increment(-1),
            storageUsed: increment(-(artwork.fileSize || 0))
        });
        
        const logRef = push(ref(database, 'deletionLogs'));
        await set(logRef, {
            deletedArtworkId: artwork.id,
            deletedArtworkTitle: artwork.title,
            deletedArtistId: artwork.artistId,
            adminId: currentUserProfile?.uid,
            adminName: currentUserProfile?.name,
            timestamp: new Date().toISOString(),
        });

        toast({ title: 'Deletion Approved', description: `"${artwork.title}" has been permanently removed.` });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Deletion Failed', description: error.message });
    }
  };

  const handleRejectDeletion = async (artwork: Artwork) => {
    try {
        await update(ref(database, `artworks/${artwork.id}`), {
            moderationStatus: 'approved',
            moderationReason: null,
            reportedBy: null,
        });
        toast({ title: 'Deletion Rejected', description: `"${artwork.title}" will remain on the platform.` });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Rejection Failed', description: error.message });
    }
  };


  if (error) {
    return <div className="text-destructive text-center p-8">{error}</div>;
  }

  if (loading) {
      return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin"/></div>
  }
  
  if (queue.length === 0) {
     return (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
            <CheckCircle className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-2xl font-semibold text-muted-foreground">The queue is clear!</h2>
            <p className="mt-2 text-muted-foreground">There are no artworks pending deletion.</p>
        </div>
     )
  }

  return (
    <TooltipProvider>
    <AlertDialog open={!!isConfirming} onOpenChange={(open) => !open && setIsConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="text-destructive"/>
                Are you sure?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isConfirming === 'approve'
                ? `This will permanently delete "${selectedArtwork?.title}". This action cannot be undone.`
                : `This will reject the deletion request and restore "${selectedArtwork?.title}" to a normal status.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
                onClick={handleActionConfirm}
                disabled={processingId === selectedArtwork?.id}
                className={isConfirming === 'approve' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
                {processingId === selectedArtwork?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                Yes, {isConfirming === 'approve' ? 'delete it' : 'reject it'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Artwork</TableHead>
            <TableHead>Artist</TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
            {queue.map(item => {
              const isProcessing = processingId === item.id;
              return (
                <TableRow key={item.id}>
                    <TableCell>
                        <div className="flex items-center gap-4">
                            <Link href={`/artwork/${item.id}`} target="_blank">
                                <div className="relative h-20 w-16 bg-muted rounded-md overflow-hidden">
                                     <Image
                                         src={item.imageUrl}
                                         alt={item.title}
                                         fill
                                         style={{ objectFit: 'contain' }}
                                         unoptimized={
                                             item.imageUrl.startsWith('data:') ||
                                             item.imageUrl.includes('lh3.googleusercontent.com') ||
                                             item.imageUrl.startsWith('/uploads')
                                         }
                                     />
                                </div>
                            </Link>
                            <div>
                                <p className="font-medium">{item.title}</p>
                                <p className="text-xs text-muted-foreground">ID: {item.id}</p>
                                {item.moderationReason && (
                                   <Tooltip>
                                        <TooltipTrigger asChild>
                                            <p className="text-xs text-amber-500 mt-1 flex items-center gap-1 cursor-pointer">
                                                <Info className="h-3 w-3" />
                                                Report Reason
                                            </p>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>{item.moderationReason}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                            </div>
                        </div>
                    </TableCell>
                    <TableCell>
                        <Link href={`/${item.artistUsername}`} target="_blank" className="flex items-center gap-2 hover:text-primary">
                            <Avatar className="h-8 w-8">
                                <AvatarImage src={item.artistAvatarUrl} />
                                <AvatarFallback><User/></AvatarFallback>
                            </Avatar>
                             <span className="font-medium">{item.artistName}</span>
                        </Link>
                    </TableCell>
                    <TableCell className="text-center">
                        {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mx-auto"/> : (
                           <div className="flex gap-2 justify-center">
                                <Button size="sm" variant="outline" onClick={() => { setSelectedArtwork(item); setIsConfirming('approve'); }} disabled={isProcessing}>
                                    <CheckCircle className="h-4 w-4 text-green-500"/>
                                    <span className="ml-2">Approve</span>
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setSelectedArtwork(item); setIsConfirming('reject'); }} disabled={isProcessing}>
                                     <XCircle className="h-4 w-4 text-red-500"/>
                                     <span className="ml-2">Reject</span>
                                </Button>
                            </div>
                        )}
                    </TableCell>
                </TableRow>
              )
            })
          }
        </TableBody>
      </Table>
    </div>
    </TooltipProvider>
  );
}
