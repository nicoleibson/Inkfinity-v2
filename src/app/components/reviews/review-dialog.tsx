// src/components/reviews/review-dialog.tsx
"use client";

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from "firebase/functions";
import { Loader2, Star } from 'lucide-react';
import type { Booking } from '@/types/booking';
import type { UserProfile } from '@/types/user';
import { cn } from '@/lib/utils';
import type { Review } from '@/types/review';
import { app } from '@/lib/firebase-config';

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking;
  currentUserProfile: UserProfile;
  perspective: 'client' | 'artist';
}

const functions = getFunctions(app);
const submitReviewFn = httpsCallable(functions, 'submitReview');

export function ReviewDialog({ open, onOpenChange, booking, currentUserProfile, perspective }: ReviewDialogProps) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [hoverRating, setHoverRating] = useState(0);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  
  const revieweeId = perspective === 'client' ? booking.artistId : booking.clientId;
  const revieweeName = perspective === 'client' ? booking.artistName : booking.clientName;

  const handleSubmitReview = async () => {
    if (rating === 0) {
      toast({ variant: 'destructive', title: 'Rating Required', description: 'Please select a star rating.' });
      return;
    }
    if (!currentUserProfile?.uid || !currentUserProfile.name) {
      toast({ variant: 'destructive', title: 'Authentication Error' });
      return;
    }

    setLoading(true);
    
    // We only need to send the data required for the function, not the full author profile
    const reviewData: Omit<Review, 'id' | 'createdAt' | 'authorName' | 'authorAvatarUrl'> = {
        bookingId: booking.id,
        rating: rating,
        text: text,
        authorId: currentUserProfile.uid,
        revieweeId: revieweeId,
    };

    try {
        const result = await submitReviewFn(reviewData);
        if ((result.data as any).success) {
            toast({ title: "Review Submitted!", description: `Thank you for reviewing ${revieweeName}.`});
            onOpenChange(false);
            setRating(0);
            setText('');
        } else {
             throw new Error((result.data as any).message || 'The function reported an error.');
        }
    } catch (error: any) {
        console.error("Review submission failed: ", error);
        toast({ variant: "destructive", title: "Submission Failed", description: error.message || "Could not submit your review." });
    } finally {
        setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-headline">Leave a Review for {revieweeName}</DialogTitle>
          <DialogDescription>
            Share your experience to help other members of the community.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Rating</Label>
            <div className="flex items-center gap-1" onMouseLeave={() => setHoverRating(0)}>
              {[...Array(5)].map((_, i) => {
                const starValue = i + 1;
                return (
                  <Star
                    key={i}
                    className={cn(
                        "h-8 w-8 cursor-pointer",
                        starValue <= (hoverRating || rating) ? 'fill-amber-400 text-amber-400' : 'fill-muted stroke-muted-foreground'
                    )}
                    onMouseEnter={() => setHoverRating(starValue)}
                    onClick={() => setRating(starValue)}
                  />
                );
              })}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="review-text">Review</Label>
            <Textarea 
                id="review-text"
                placeholder="Describe your experience..."
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmitReview} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
            Submit Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
