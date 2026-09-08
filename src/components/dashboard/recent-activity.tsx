// src/components/dashboard/recent-activity.tsx
"use client";

import { useEffect, useState } from 'react';
import { auth, database } from '@/lib/firebase-config';
import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database';
import type { Notification } from '@/types/user';
import { onAuthStateChanged } from 'firebase/auth';
import { Bell, User, Heart, Gem, Building, MessageSquare, Star } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

type NotificationWithId = Notification & { id: string };

const notificationIcons: Record<string, React.ElementType> = {
    follow: User,
    like: Heart,
    sale: Gem,
    booking: Bell,
    studio_invite: Building,
    comment: MessageSquare,
    review: Star,
    chat_message: MessageSquare,
};

export function RecentActivity() {
    const [notifications, setNotifications] = useState<NotificationWithId[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                const notificationsRef = query(ref(database, `users/${user.uid}/notifications`), orderByChild('createdAt'), limitToLast(5));
                onValue(notificationsRef, (snapshot) => {
                    const data: NotificationWithId[] = [];
                    snapshot.forEach(child => {
                        data.push({ id: child.key!, ...child.val() });
                    });
                    setNotifications(data.reverse());
                    setLoading(false);
                });
            } else {
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    if (loading) {
        return <p>Loading activity...</p>;
    }

    if (notifications.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-8">
                <p>No recent activity.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {notifications.map((notification) => {
                const Icon = notificationIcons[notification.type] || Bell;
                return (
                    <div key={notification.id} className="flex items-center">
                        <Icon className="h-5 w-5 text-muted-foreground mr-4" />
                        <div className="flex-grow">
                            <p className="text-sm" dangerouslySetInnerHTML={{ __html: notification.message.replace(notification.fromUserName, `<strong class="font-semibold text-primary">${notification.fromUserName}</strong>`)}} />
                            <p className="text-xs text-muted-foreground">
                                {notification.createdAt ? formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true }) : 'just now'}
                            </p>
                        </div>
                    </div>
                );
            })}
             <Button variant="outline" className="w-full mt-4" asChild>
                <Link href="/notifications">View All Notifications</Link>
            </Button>
        </div>
    );
}
