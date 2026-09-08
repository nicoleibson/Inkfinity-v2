// src/components/layout/notification-bell.tsx
"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { UserProfile } from '@/types/user';
import { onValue, ref, query, orderByChild } from 'firebase/database';
import { database } from '@/lib/firebase-config';

interface NotificationBellProps {
    userProfile: UserProfile | null;
}

export function NotificationBell({ userProfile }: NotificationBellProps) {
    const [hasUnread, setHasUnread] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (!userProfile?.uid) return;

        const notificationsRef = query(ref(database, `users/${userProfile.uid}/notifications`), orderByChild('createdAt'));
        
        const unsubscribe = onValue(notificationsRef, (snapshot) => {
            if (!snapshot.exists()) {
                setHasUnread(false);
                return;
            }
            
            const lastCheckTime = new Date(userProfile.lastNotificationCheck || 0).getTime();
            let newNotificationsFound = false;

            snapshot.forEach(child => {
                const notification = child.val();
                if (notification.createdAt > lastCheckTime) {
                    newNotificationsFound = true;
                }
            });

            setHasUnread(newNotificationsFound);
        });

        return () => unsubscribe();

    }, [userProfile]);

    const handleClick = () => {
        router.push('/notifications');
    };

    return (
        <Button variant="ghost" size="icon" onClick={handleClick} className="relative">
            <Bell className="h-5 w-5" />
            {hasUnread && (
                <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </span>
            )}
            <span className="sr-only">View notifications</span>
        </Button>
    );
}
