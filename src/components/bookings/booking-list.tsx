// src/components/bookings/booking-list.tsx
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Booking, BookingStatus } from '@/types/booking';
import type { UserProfile, Notification } from '@/types/user';
import { format, parseISO, isPast } from 'date-fns';
import { Calendar, Check, Clock, User, X, Wallet, Loader2, CheckCheck, Star, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { database } from '@/lib/firebase-config';
import { ref, update, push, serverTimestamp, get } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/context/wallet-provider';
import { parseEther, parseUnits } from 'ethers';
import { ReviewDialog } from '@/components/reviews/review-dialog';
import { getTokenPriceUsd, tokenSymbolForNetwork } from '@/lib/pricing';
import { verifyWithPolling } from '@/lib/payment-verification-client';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { isInWorldApp, sendWorldAppTransaction } from '@/lib/world-app';
import { NETWORK_TOKEN_SYMBOL } from '@/lib/blockchain';


interface BookingListProps {
  bookings: Booking[];
  perspective: 'client' | 'artist';
  currentUser: UserProfile;
}

const statusConfig: Record<BookingStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', color: 'bg-amber-500', icon: Clock },
  awaiting_payment: { label: 'Awaiting Payment', color: 'bg-blue-500', icon: Clock },
  confirmed: { label: 'Confirmed', color: 'bg-green-500', icon: Check },
  completed: { label: 'Completed', color: 'bg-indigo-500', icon: CheckCheck },
  cancelled: { label: 'Cancelled', color: 'bg-red-500', icon: X },
};

export function BookingList({ bookings, perspective, currentUser }: BookingListProps) {
  const { toast } = useToast();
  const { provider, connectWallet, isConnected, walletAddress } = useWallet();
  const { settings } = usePlatformSettings();
  const bookingNetwork = isInWorldApp() ? 'worldchain' : settings?.network;
  const tokenSymbol = NETWORK_TOKEN_SYMBOL[bookingNetwork as keyof typeof NETWORK_TOKEN_SYMBOL] ?? 'WLD';
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null);
  const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [tokenPrice, setTokenPrice] = useState<number | null>(null);

  // The deposit is quoted in USD and paid in the chain's native token, so the price
  // must match the network: WLD on WorldChain, ETH on Polygon/Amoy. The server applies
  // the same price (src/lib/pricing.ts) to bound a valid transfer, so both sides agree.
  useEffect(() => {
    let cancelled = false;
    getTokenPriceUsd(tokenSymbolForNetwork(bookingNetwork)).then(price => {
      if (!cancelled) setTokenPrice(price);
    });
    return () => {
      cancelled = true;
    };
  }, [bookingNetwork]);

  const handleUpdateStatus = async (bookingId: string, newStatus: BookingStatus, updates?: Partial<Booking>) => {
    setUpdatingBookingId(bookingId);
    try {
      const allUpdates: { [key: string]: any } = {};
      allUpdates[`/bookings/${bookingId}/status`] = newStatus;
      if (updates) {
        Object.keys(updates).forEach(key => {
            allUpdates[`/bookings/${bookingId}/${key}`] = (updates as any)[key];
        });
      }


      // Create a notification for the client on status change
      if (perspective === 'artist') {
        const booking = bookings.find(b => b.id === bookingId);
        if (booking) {
            const notificationsRef = ref(database, `users/${booking.clientId}/notifications`);
            const newNotificationKey = push(notificationsRef).key;

            if (newNotificationKey) {
                const newNotification: Omit<Notification, 'id'> = {
                  type: 'booking',
                  fromUserId: currentUser.uid,
                  fromUserName: currentUser.name,
                  message: `Your booking with ${currentUser.name} has been ${newStatus}.`,
                  isRead: false,
                  createdAt: serverTimestamp(),
                  link: `/dashboard/bookings`
                };
                allUpdates[`/users/${booking.clientId}/notifications/${newNotificationKey}`] = newNotification;
            }
        }
      }

      await update(ref(database), allUpdates);

      toast({
        title: 'Booking Updated',
        description: `The booking status has been changed.`,
      });
    } catch (error) {
      console.error('Failed to update booking status:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not update the booking status.',
      });
    } finally {
        setUpdatingBookingId(null);
    }
  };
  
  const handleAcceptBooking = (booking: Booking) => {
    const newStatus = booking.depositAmount && booking.depositAmount > 0 ? 'awaiting_payment' : 'confirmed';
    handleUpdateStatus(booking.id, newStatus);
  };

  const handlePayDeposit = async (booking: Booking) => {
    if (!isConnected || !provider) {
        toast({ variant: 'destructive', title: 'Wallet Not Connected', description: 'Please connect your wallet to pay.' });
        connectWallet();
        return;
    }
    if (!booking.artistWalletAddress || !booking.depositAmount || !tokenPrice) {
        toast({ variant: 'destructive', title: 'Payment Error', description: 'Artist wallet, deposit amount, or ETH price is not set.' });
        return;
    }
    
    setPayingBookingId(booking.id);
    
    try {
        const depositInToken = booking.depositAmount / tokenPrice;
        let txHash: string | null = null;
        let userOpHash: string | null = null;

        if (isInWorldApp()) {
            const userOp = await sendWorldAppTransaction({
                to: booking.artistWalletAddress as string,
                valueWei: parseEther(depositInToken.toFixed(18)),
            });
            userOpHash = userOp.userOpHash;
        } else {
            const signer = await provider.getSigner(walletAddress ?? undefined);

            const txParams: { to: string, value: bigint, maxPriorityFeePerGas?: bigint, maxFeePerGas?: bigint } = {
                to: booking.artistWalletAddress,
                value: parseEther(depositInToken.toFixed(18))
            };
            if (settings?.network === 'amoy') {
                const fee = parseUnits('30', 'gwei');
                txParams.maxPriorityFeePerGas = fee;
                txParams.maxFeePerGas = fee;
            }
            const tx = await signer.sendTransaction(txParams);
            txHash = tx.hash;
        }

        toast({ title: 'Transaction Sent', description: 'Waiting for blockchain confirmation...' });

        // The booking is only marked as paid once the server has proven the transfer
        // on-chain. The client no longer flips the status itself: doing so credited
        // deposits that were never paid (and World App user operations are not even
        // mined when the wallet returns the hash).
        await verifyWithPolling(
            '/api/verify-booking-payment',
            {
                bookingId: booking.id,
                intent: 'deposit',
                txHash,
                userOpHash,
                network: bookingNetwork || 'worldchain',
            },
            {
                onPending: () =>
                    toast({ title: 'Confirming on-chain', description: 'Waiting for the deposit to be included in a block...' }),
            },
        );

        toast({ title: 'Payment Confirmed!', description: 'Your booking is confirmed.' });

    } catch (error: any) {
        console.error("Payment failed:", error);
        if (error.code === 'INSUFFICIENT_FUNDS') {
            toast({ variant: 'destructive', title: 'Insufficient Funds', description: `You do not have enough ${tokenSymbol} in your wallet to complete this transaction.` });
        } else if (error.code === 'CALL_EXCEPTION') {
             toast({ variant: 'destructive', title: 'Transaction Failed', description: 'The transaction is likely to fail. Please check your wallet balance and network, then try again.' });
        } else if (error.code === 'TX_PENDING') {
            toast({ variant: 'destructive', title: 'Still Confirming', description: 'Your deposit was sent and is waiting for on-chain confirmation. It will be applied automatically — do not pay again.' });
        } else {
            toast({ variant: 'destructive', title: 'Payment Failed', description: error?.message || error?.reason || 'An unknown error occurred.' });
        }
    } finally {
        setPayingBookingId(null);
    }
  };
  
  const handleCancelBooking = async (booking: Booking) => {
    // If client hasn't paid yet, they can just cancel.
    if (booking.status === 'awaiting_payment' && perspective === 'client') {
        handleUpdateStatus(booking.id, 'cancelled');
        return;
    }

    if (booking.status === 'confirmed' && perspective === 'client') {
        // Client cancels, forfeits deposit. No refund logic.
        handleUpdateStatus(booking.id, 'cancelled');
        toast({ title: 'Booking Cancelled', description: 'Your booking has been cancelled.' });
        return;
    }
    
    // Artist can cancel a confirmed booking (refunding the deposit)
    if (booking.status === 'confirmed' && perspective === 'artist') {
        if (!booking.depositAmount || booking.depositAmount === 0) {
            handleUpdateStatus(booking.id, 'cancelled');
            return;
        }

        if (!isConnected || !provider) {
            toast({ variant: 'destructive', title: 'Wallet Not Connected', description: 'Your wallet must be connected to process a deposit refund.' });
            connectWallet();
            return;
        }

        if (!booking.clientWalletAddress || !tokenPrice) {
            toast({ variant: 'destructive', title: 'Refund Error', description: 'Client wallet, deposit amount, or ETH price is missing.' });
            return;
        }

        setUpdatingBookingId(booking.id);
        try {
            const depositInToken = booking.depositAmount / tokenPrice;
            let txHash: string | null = null;
            let userOpHash: string | null = null;

            if (isInWorldApp()) {
                const userOp = await sendWorldAppTransaction({
                    to: booking.clientWalletAddress as string,
                    valueWei: parseEther(depositInToken.toFixed(18)),
                });
                userOpHash = userOp.userOpHash;
            } else {
                const signer = await provider.getSigner(walletAddress ?? undefined);

                const txParams: { to: string, value: bigint, maxPriorityFeePerGas?: bigint, maxFeePerGas?: bigint } = {
                    to: booking.clientWalletAddress, // Refund to client
                    value: parseEther(depositInToken.toFixed(18))
                };
        
                if (settings?.network === 'amoy') {
                    const fee = parseUnits('30', 'gwei');
                    txParams.maxPriorityFeePerGas = fee;
                    txParams.maxFeePerGas = fee;
                }
                const tx = await signer.sendTransaction(txParams);
                txHash = tx.hash;
            }

            toast({ title: 'Refund Sent', description: 'Waiting for blockchain confirmation...' });

            // As with the deposit, the cancellation is only recorded once the refund is
            // proven on-chain by the server.
            await verifyWithPolling(
                '/api/verify-booking-payment',
                {
                    bookingId: booking.id,
                    intent: 'refund',
                    txHash,
                    userOpHash,
                    network: bookingNetwork || 'worldchain',
                },
                {
                    onPending: () =>
                        toast({ title: 'Confirming on-chain', description: 'Waiting for the refund to be included in a block...' }),
                },
            );

            toast({ title: 'Booking Cancelled', description: 'The deposit has been refunded.' });

        } catch (error: any) {
            console.error("Cancellation/Refund failed:", error);
            if (error.code === 'INSUFFICIENT_FUNDS') {
                toast({ variant: 'destructive', title: 'Insufficient Funds', description: `You do not have enough ${tokenSymbol} in your wallet to process the refund.` });
            } else if (error.code === 'CALL_EXCEPTION') {
                 toast({ variant: 'destructive', title: 'Transaction Failed', description: 'The refund transaction is likely to fail. Please check your wallet balance and network, then try again.' });
            } else {
                toast({ variant: 'destructive', title: 'Cancellation Failed', description: error?.reason || 'An unknown error occurred.' });
            }
        } finally {
            setUpdatingBookingId(null);
        }
    }
  };

  const handleMarkAttended = async (booking: Booking) => {
    const isClient = perspective === 'client';
    setUpdatingBookingId(booking.id);
    
    try {
        const bookingRef = ref(database, `bookings/${booking.id}`);
        const currentBookingSnap = await get(bookingRef);
        if (!currentBookingSnap.exists()) {
            toast({ variant: "destructive", title: "Booking not found." });
            return;
        }
        
        const currentBookingData = currentBookingSnap.val();
        const updates: Partial<Booking> = isClient ? { clientAttended: true } : { artistAttended: true };
        
        // Check if the other party has already attended
        if ((isClient && currentBookingData.artistAttended) || (!isClient && currentBookingData.clientAttended)) {
            // If yes, this is the second confirmation, so complete the booking.
            await handleUpdateStatus(booking.id, 'completed', updates);
        } else {
            // If no, this is the first confirmation.
            await handleUpdateStatus(booking.id, 'confirmed', updates);
            toast({ title: 'Attendance Marked', description: 'Waiting for the other party to confirm attendance.' });
        }
    } catch(err) {
        toast({ variant: "destructive", title: "Failed to mark attendance." });
    } finally {
        setUpdatingBookingId(null);
    }
  };
  
  const openReviewDialog = (booking: Booking) => {
    setSelectedBooking(booking);
    setIsReviewDialogOpen(true);
  };


  if (bookings.length === 0) {
    return <div className="text-center py-16 border-2 border-dashed rounded-lg">
        <h2 className="text-2xl font-semibold text-muted-foreground">No bookings found.</h2>
        <p className="mt-2 text-muted-foreground">
          {perspective === 'client' ? "You haven't made any booking requests yet." : "You haven't received any booking requests yet."}
        </p>
      </div>
  }

  return (
    <>
      {selectedBooking && (
        <ReviewDialog
            open={isReviewDialogOpen}
            onOpenChange={setIsReviewDialogOpen}
            booking={selectedBooking}
            currentUserProfile={currentUser}
            perspective={perspective}
        />
      )}
      <div className="space-y-4">
        {bookings.map((booking) => {
          const otherPartyName = perspective === 'client' ? booking.artistName : booking.clientName;
          const otherPartyAvatar = perspective === 'client' ? booking.artistAvatarUrl : booking.clientAvatarUrl;
          const bookingDate = parseISO(booking.bookingDate);
          const { label, color, icon: Icon } = statusConfig[booking.status] || statusConfig.pending;
          const isPaying = payingBookingId === booking.id;
          const isUpdating = updatingBookingId === booking.id;
          
          const hasAttended = perspective === 'client' ? booking.clientAttended : booking.artistAttended;
          const hasReviewed = perspective === 'client' ? booking.clientReviewed : booking.artistReviewed;
          const depositInToken = tokenPrice && booking.depositAmount ? (booking.depositAmount / tokenPrice).toFixed(4) : '...';
          
          const blockExplorerUrl = settings?.network === 'polygon' 
            ? 'https://polygonscan.com/tx/' 
            : 'https://amoy.polygonscan.com/tx/';

          return (
            <Card key={booking.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                      <CardTitle className="font-headline flex items-center gap-2">
                          {perspective === 'client' ? 'Session with' : 'Request from'} {otherPartyName}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4 mt-2">
                          <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4"/>{format(bookingDate, 'PPP')}</span>
                      </CardDescription>
                  </div>
                  <Badge className={cn("text-white", color)}>
                      <Icon className="mr-1 h-3 w-3" />
                      {label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={otherPartyAvatar} />
                    <AvatarFallback><User /></AvatarFallback>
                  </Avatar>
                  <div className="flex-grow p-4 bg-muted/50 rounded-md">
                      <p className="text-sm text-muted-foreground">{booking.description}</p>
                      {booking.depositAmount && booking.depositAmount > 0 && (
                          <p className="text-sm font-semibold mt-2">Deposit: ${booking.depositAmount} USD (~{depositInToken} {tokenSymbol})</p>
                      )}
                  </div>
                  <div className="flex flex-col items-center justify-center gap-2 min-w-[120px]">
                      {perspective === 'artist' && booking.status === 'pending' && !isUpdating && (
                          <>
                              <Button size="sm" className="w-full" onClick={() => handleAcceptBooking(booking)}>
                                  <Check className="mr-2 h-4 w-4" /> Accept
                              </Button>
                              <Button size="sm" className="w-full" variant="destructive" onClick={() => handleUpdateStatus(booking.id, 'cancelled')}>
                                  <X className="mr-2 h-4 w-4" /> Decline
                              </Button>
                          </>
                      )}
                      {perspective === 'client' && booking.status === 'awaiting_payment' && (
                          <div className="w-full space-y-2">
                             <Button size="sm" className="w-full" onClick={() => handlePayDeposit(booking)} disabled={isPaying || !tokenPrice}>
                                {isPaying ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Wallet className="mr-2 h-4 w-4" />}
                                {isPaying ? 'Processing...' : 'Pay Deposit'}
                            </Button>
                            <Button size="sm" variant="ghost" className="w-full" onClick={() => handleUpdateStatus(booking.id, 'cancelled')} disabled={isUpdating}>
                                <Ban className="mr-2 h-4 w-4" /> Cancel
                            </Button>
                          </div>
                      )}
                       {booking.status === 'confirmed' && !isPast(bookingDate) && (
                         <Button size="sm" variant="destructive" className="w-full" onClick={() => handleCancelBooking(booking)} disabled={isUpdating}>
                            <Ban className="mr-2 h-4 w-4" />
                            {isUpdating ? 'Cancelling...' : 'Cancel'}
                         </Button>
                      )}
                      {booking.status === 'confirmed' && isPast(bookingDate) && (
                          <Button size="sm" className="w-full" variant="outline" onClick={() => handleMarkAttended(booking)} disabled={hasAttended || isUpdating}>
                              {isUpdating ? <Loader2 className="animate-spin" /> : (hasAttended ? <CheckCheck className="mr-2 h-4 w-4 text-green-500" /> : <Check className="mr-2 h-4 w-4" />)}
                              {isUpdating ? 'Updating...' : (hasAttended ? 'Attended' : 'Mark Attended')}
                          </Button>
                      )}
                       {booking.status === 'completed' && !hasReviewed && (
                            <Button size="sm" className="w-full" onClick={() => openReviewDialog(booking)}>
                                <Star className="mr-2 h-4 w-4" /> Leave a Review
                            </Button>
                       )}
                       {booking.status === 'completed' && hasReviewed && (
                            <Button size="sm" className="w-full" disabled variant="outline">
                                <Check className="mr-2 h-4 w-4" /> Reviewed
                            </Button>
                       )}
                      {isUpdating && <Loader2 className="h-6 w-6 animate-spin" />}
                      {booking.paymentTxHash && (
                          <div className="text-xs text-muted-foreground self-center mt-1">
                              <a href={`${blockExplorerUrl}${booking.paymentTxHash}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                  Deposit Tx: {booking.paymentTxHash.slice(0,10)}...
                              </a>
                          </div>
                      )}
                      {booking.cancellationTxHash && (
                           <div className="text-xs text-muted-foreground self-center mt-1">
                              <a href={`${blockExplorerUrl}${booking.cancellationTxHash}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                  Refund Tx: {booking.cancellationTxHash.slice(0,10)}...
                              </a>
                          </div>
                      )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
