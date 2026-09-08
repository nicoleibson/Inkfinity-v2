// src/components/artwork/artwork-actions.tsx
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MoreVertical, Pencil, Trash2, Loader2, ShieldAlert } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { auth, database } from '@/lib/firebase-config';
import { ref as dbRef, remove, update, increment, get } from 'firebase/database';
import { deleteFromStorage } from '@/lib/firebase/storage';
import type { Artwork } from '@/types/artwork';
import { ArtworkEditDialog } from './artwork-edit-dialog';
import type { UserProfile } from '@/types/user';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

interface ArtworkActionsProps {
  artwork: Artwork;
}

export function ArtworkActions({ artwork }: ArtworkActionsProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (currentUser) {
        get(dbRef(database, `users/${currentUser.uid}`)).then(snapshot => {
            if (snapshot.exists()) {
                setCurrentUserProfile(snapshot.val());
            }
        });
    }
  }, [currentUser]);

  const handleArtistDelete = async () => {
    if (!currentUser) return;
    setIsProcessing(true);

    try {
      // 1. Delete from local storage
      await deleteFromStorage(artwork.storagePath);

      // 2. Delete from Realtime Database
      const artworkDbRef = dbRef(database, `artworks/${artwork.id}`);
      await remove(artworkDbRef);
      
      // 3. Update user's artwork count and storage used
      const userRef = dbRef(database, `users/${artwork.artistId}`);
      await update(userRef, {
        artworksCount: increment(-1),
        storageUsed: increment(-(artwork.fileSize || 0))
      });

      toast({
        title: 'Artwork Deleted',
        description: `"${artwork.title}" has been permanently removed.`,
      });

      router.push(`/${artwork.artistUsername}`);

    } catch (error: any) {
      console.error('Delete error:', error);
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: error.message || 'Could not delete the artwork.',
      });
    } finally {
        setIsProcessing(false);
        setIsDeleteDialogOpen(false);
    }
  };
  
  const handleAdminReport = async () => {
    if (!currentUser) return;
    if (!reportReason.trim()) {
        toast({ variant: 'destructive', title: 'Reason Required', description: 'Please provide a reason for the report.' });
        return;
    }

    setIsProcessing(true);
    try {
        const artworkRef = dbRef(database, `artworks/${artwork.id}`);
        await update(artworkRef, { 
            moderationStatus: 'pending_deletion',
            reportedBy: currentUser.uid,
            moderationReason: reportReason,
        });
        toast({
            title: 'Reported for Deletion',
            description: `This artwork has been submitted for review by a Super-Administrator.`
        });
    } catch (error: any) {
         toast({ variant: 'destructive', title: 'Report Failed' });
    } finally {
        setIsProcessing(false);
        setReportReason('');
        setIsReportDialogOpen(false);
    }
  }

  if (!currentUser || !currentUserProfile) {
    return null; // Don't render anything if user data is not loaded
  }

  const isOwner = currentUser.uid === artwork.ownerId;
  const isAdmin = currentUserProfile.role === 'Administrator' || currentUserProfile.role === 'Super-Administrator';

  const canPerformActions = isOwner || isAdmin;

  if (!canPerformActions) {
    return null;
  }
  
  const canEdit = isOwner;
  const canDelete = isOwner && currentUser.uid === artwork.artistId; // Only original artist can delete
  const canReport = isAdmin && !isOwner;

  const isPendingDeletion = artwork.moderationStatus === 'pending_deletion';

  return (
    <>
      <ArtworkEditDialog 
        artwork={artwork}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this artwork?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete "{artwork.title}" and remove its data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArtistDelete} disabled={isProcessing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                Yes, delete it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

       <AlertDialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Report this artwork for deletion?</AlertDialogTitle>
            <AlertDialogDescription>
               Please provide a reason for reporting "{artwork.title}". This will be sent to a Super-Administrator for review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reportReason">Reason for Report</Label>
            <Textarea
                id="reportReason"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="e.g., Copyright infringement, inappropriate content..."
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReportReason('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAdminReport} disabled={isProcessing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                Yes, report it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-5 w-5" />
            <span className="sr-only">More actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && (
              <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                <span>Edit</span>
              </DropdownMenuItem>
          )}
          {canDelete && (
             <DropdownMenuItem onClick={() => setIsDeleteDialogOpen(true)} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Delete</span>
            </DropdownMenuItem>
          )}
          {canReport && (
             <DropdownMenuItem onClick={() => setIsReportDialogOpen(true)} className="text-destructive focus:text-destructive" disabled={isPendingDeletion}>
                <ShieldAlert className="mr-2 h-4 w-4" />
                <span>{isPendingDeletion ? "Pending Deletion" : "Report for Deletion"}</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
