// src/app/dashboard/bookings/page.tsx
"use client";

import { useState, useEffect } from 'react';
import { useUserSession } from '@/hooks/useUserSession';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingList } from '@/components/bookings/booking-list';
import { auth, database } from '@/lib/firebase-config';
import { ref, query, orderByChild, equalTo, onValue, get } from 'firebase/database';
import type { Booking } from '@/types/booking';
import type { UserProfile } from '@/types/user'; 
import { Loader2, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { onAuthStateChanged } from 'firebase/auth';
import { cn } from '@/lib/utils';

export default function BookingsPage() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [bookingRequests, setBookingRequests] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  useUserSession();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = ref(database, `users/${user.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          const profile: UserProfile = { uid: user.uid, ...snapshot.val() };
           if (profile.role === 'Administrator' || profile.role === 'Super-Administrator') {
              toast({
                variant: 'destructive',
                title: 'Access Denied',
                description: 'Administrators do not have access to bookings.'
              });
              router.push('/dashboard');
              return;
           }
          setCurrentUser(profile);
        } else {
            router.push('/login');
        }
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router, toast]);

  useEffect(() => {
    if (!currentUser?.uid) return;

    setLoading(true);
    const bookingsRef = ref(database, 'bookings');

    const myBookingsQuery = query(bookingsRef, orderByChild('clientId'), equalTo(currentUser.uid));
    const unsubscribeMyBookings = onValue(myBookingsQuery, (snapshot) => {
      const data: Booking[] = [];
      snapshot.forEach((childSnapshot) => {
        data.push({ id: childSnapshot.key!, ...childSnapshot.val() });
      });
      setMyBookings(data.reverse());
      setLoading(false);
    }, () => setLoading(false));

    let unsubscribeBookingRequests = () => {};
    if (currentUser.role !== 'Client') {
        const bookingRequestsQuery = query(bookingsRef, orderByChild('artistId'), equalTo(currentUser.uid));
        unsubscribeBookingRequests = onValue(bookingRequestsQuery, (snapshot) => {
          const data: Booking[] = [];
          snapshot.forEach((childSnapshot) => {
            data.push({ id: childSnapshot.key!, ...childSnapshot.val() });
          });
          setBookingRequests(data.reverse());
        });
    }
    
    return () => {
      unsubscribeMyBookings();
      unsubscribeBookingRequests();
    };
  }, [currentUser]);

  if (loading || !currentUser) {
      return (
        <div className="flex justify-center items-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )
  }
  
  const isAdmin = currentUser?.role === 'Administrator' || currentUser?.role === 'Super-Administrator';
  if (isAdmin) {
    return null; // The redirect is handled in the useEffect, this prevents rendering anything.
  }

  const hasBookingRequests = currentUser.role !== 'Client';

  return (
    <Tabs defaultValue="my-bookings" className="w-full">
      <TabsList className={cn("grid w-full", hasBookingRequests ? "grid-cols-2" : "grid-cols-1", "max-w-md")}>
        <TabsTrigger value="my-bookings">My Bookings</TabsTrigger>
        {hasBookingRequests && (
            <TabsTrigger value="booking-requests">Booking Requests</TabsTrigger>
        )}
      </TabsList>
      <TabsContent value="my-bookings" className="mt-6">
        <BookingList bookings={myBookings} perspective="client" currentUser={currentUser} />
      </TabsContent>
      {hasBookingRequests && (
        <TabsContent value="booking-requests" className="mt-6">
            <BookingList bookings={bookingRequests} perspective="artist" currentUser={currentUser} />
        </TabsContent>
      )}
    </Tabs>
  );
}
