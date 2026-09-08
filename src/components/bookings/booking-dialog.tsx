// src/components/bookings/booking-dialog.tsx
"use client";

import { useState, useEffect } from 'react';
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
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { auth, database } from '@/lib/firebase-config';
import { ref, push, set, update, query, orderByChild, equalTo, onValue, get, serverTimestamp } from 'firebase/database';
import { Loader2 } from 'lucide-react';
import type { Booking } from '@/types/booking';
import type { UserProfile, Notification } from '@/types/user';
import { isSameDay, format as formatDate } from 'date-fns';

interface BookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artist: UserProfile;
}

export function BookingDialog({ open, onOpenChange, artist }: BookingDialogProps) {
  const [bookingDate, setBookingDate] = useState<Date | undefined>(new Date());
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [artistBookings, setArtistBookings] = useState<Booking[]>([]);
  const [artistAvailability, setArtistAvailability] = useState<{ [date: string]: boolean }>({});
  const [loadingBookings, setLoadingBookings] = useState(true);
  const { toast } = useToast();
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (open && artist.uid) {
        setLoadingBookings(true);
        setArtistAvailability(artist.availability || {});

        const bookingsRef = query(ref(database, 'bookings'), orderByChild('artistId'), equalTo(artist.uid));
        
        const unsubscribe = onValue(bookingsRef, (snapshot) => {
            const bookings: Booking[] = [];
            snapshot.forEach(child => {
                const booking = child.val();
                if (booking.status === 'confirmed') {
                    bookings.push(booking);
                }
            });
            setArtistBookings(bookings);
            setLoadingBookings(false);
        }, () => {
             setLoadingBookings(false); // also stop loading on error
        });

        return () => unsubscribe();
    }
  }, [open, artist]);

  const isDateDisabled = (date: Date) => {
    const dateString = formatDate(date, 'yyyy-MM-dd');
    if (artistAvailability[dateString]) {
        return true; // Artist marked this day as unavailable
    }

    const bookingsOnDate = artistBookings.filter(booking => 
        isSameDay(new Date(booking.bookingDate), date)
    );
    // Example: Disable date if 3 or more bookings are confirmed for that day.
    return bookingsOnDate.length >= 3; 
  };

  const handleBookingSubmit = async () => {
    if (!currentUser) {
      toast({ variant: 'destructive', title: 'Authentication Error', description: 'You must be logged in to book.' });
      return;
    }
    if (!bookingDate) {
      toast({ variant: 'destructive', title: 'Date Required', description: 'Please select a date for your booking.' });
      return;
    }
    if (!artist.allowsArtistBookings) {
        toast({ variant: 'destructive', title: 'Bookings Closed', description: 'This artist is not currently accepting new bookings.' });
        return;
    }

    const depositAmountInUSD = artist.bookingDeposit || 0;

    if (depositAmountInUSD > 0 && !artist.walletAddress) {
       toast({ variant: 'destructive', title: 'Artist Not Ready', description: 'This artist has not set up their wallet for payments yet.' });
       return;
    }
    if (isDateDisabled(bookingDate)) {
        toast({ variant: 'destructive', title: 'Date Unavailable', description: 'This date is either fully booked or blocked by the artist. Please select another date.' });
        return;
    }

    setLoading(true);
    
    // Get client's wallet address from their profile
    const clientProfileSnap = await get(ref(database, `users/${currentUser.uid}`));
    const clientWalletAddress = clientProfileSnap.exists() ? clientProfileSnap.val().walletAddress : null;

    if (depositAmountInUSD > 0 && !clientWalletAddress) {
        toast({ variant: 'destructive', title: 'Your Wallet is Not Set', description: 'Please set your wallet address in your settings before booking.' });
        setLoading(false);
        return;
    }
    
    const newBookingKey = push(ref(database, 'bookings')).key;
    if (!newBookingKey) {
        toast({ variant: 'destructive', title: 'Booking Failed', description: 'Could not generate a booking ID.' });
        setLoading(false);
        return;
    }

    const newBookingData: any = {
      artistId: artist.uid,
      artistName: artist.name,
      artistAvatarUrl: artist.avatarUrl,
      artistWalletAddress: artist.walletAddress || null,
      clientId: currentUser.uid,
      clientName: currentUser.displayName || 'Anonymous',
      clientEmail: currentUser.email || '',
      clientAvatarUrl: currentUser.photoURL || '',
      clientWalletAddress: clientWalletAddress || null,
      bookingDate: bookingDate.toISOString(),
      status: 'pending',
      createdAt: serverTimestamp(),
      description: description,
      depositAmount: depositAmountInUSD,
    };
    
    // This is the multi-path update. We will only write to the paths the client has permission to.
    const updates: { [key: string]: any } = {};
    updates[`/bookings/${newBookingKey}`] = newBookingData;
    updates[`/users/${currentUser.uid}/my-bookings/${newBookingKey}`] = true;
    
    // The notification and artist's booking list will be updated by the artist when they accept.
    // This avoids the client trying to write to the artist's data, which causes a permission error.

    try {
      await update(ref(database), updates);

      toast({ title: 'Booking Request Sent', description: 'The artist has been notified. You will be updated on its status.' });
      onOpenChange(false);
      setDescription('');
      setBookingDate(new Date());
    } catch (error: any) {
      console.error('Booking failed:', error);
      toast({ variant: 'destructive', title: 'Booking Failed', description: error.message || 'Could not send your booking request.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-headline">Book a Session with {artist.name}</DialogTitle>
          <DialogDescription>
            Select a preferred date and provide details about your tattoo idea. The artist will review and confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2 justify-center">
            <Label>Preferred Date</Label>
            {loadingBookings ? (
                 <div className="flex justify-center items-center h-[298px] w-[280px]">
                    <Loader2 className="h-8 w-8 animate-spin" />
                 </div>
            ) : (
                <Calendar
                  mode="single"
                  selected={bookingDate}
                  onSelect={setBookingDate}
                  className="rounded-md border"
                  disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() - 1)) || isDateDisabled(date)}
                />
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your idea, placement, size, etc."
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleBookingSubmit} disabled={loading || loadingBookings || !artist.allowsArtistBookings}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {artist.allowsArtistBookings ? 'Send Request' : 'Bookings Closed'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
