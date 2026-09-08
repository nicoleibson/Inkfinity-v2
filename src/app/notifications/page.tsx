// src/app/notifications/page.tsx
"use client";

import { useEffect, useState } from 'react';
import { auth, database } from '@/lib/firebase-config';
import { ref, onValue, query, orderByChild, limitToLast, update, get, remove, serverTimestamp } from 'firebase/database';
import type { Notification, UserProfile } from '@/types/user';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { Bell, Loader2, User, Heart, Gem, Building, Check, X, MessageSquare, Star } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

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

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<NotificationWithId[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
    const [updatingInvite, setUpdatingInvite] = useState<string | null>(null);
    const router = useRouter();
    const { toast } = useToast();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                const userRef = ref(database, `users/${user.uid}`);
                const notificationsRef = query(ref(database, `users/${user.uid}/notifications`), orderByChild('createdAt'), limitToLast(50));
                
                onValue(userRef, (snapshot) => {
                    setCurrentUser({uid: user.uid, ...snapshot.val()});
                });

                onValue(notificationsRef, (snapshot) => {
                    const data: NotificationWithId[] = [];
                    snapshot.forEach(child => {
                        data.push({ id: child.key!, ...child.val() });
                    });
                    setNotifications(data.reverse());
                    setLoading(false);
                });

                // Mark notifications as read
                await update(userRef, { lastNotificationCheck: serverTimestamp() });

            } else {
                router.push('/login');
            }
        });

        return () => unsubscribe();
    }, [router]);

    const handleInviteResponse = async (notification: NotificationWithId, accept: boolean) => {
        if (!currentUser?.uid || !notification.inviteId) return;

        setUpdatingInvite(notification.id);
        const inviteRef = ref(database, `users/${currentUser.uid}/studioInvites/${notification.inviteId}`);
        
        try {
            if (accept) {
                const inviteSnapshot = await get(inviteRef);
                if (!inviteSnapshot.exists()) {
                    toast({ variant: 'destructive', title: 'Invite Expired' });
                    // Remove the notification since the invite is gone
                    await remove(ref(database, `users/${currentUser.uid}/notifications/${notification.id}`));
                    return;
                }
                const invite = inviteSnapshot.val();

                const updates: { [key: string]: any } = {};
                updates[`/users/${currentUser.uid}/studioId`] = invite.fromStudioId;
                updates[`/users/${currentUser.uid}/studioName`] = invite.fromStudioName;
                updates[`/users/${invite.fromStudioId}/residentArtists/${currentUser.uid}`] = true;
                
                // Clear all other pending invites for this user
                updates[`/users/${currentUser.uid}/studioInvites`] = null;

                await update(ref(database), updates);

                toast({ title: 'Studio Joined!', description: `You are now a resident artist at ${invite.fromStudioName}.` });
            } else {
                 await remove(inviteRef);
                 toast({ title: 'Invite Rejected' });
            }
            
            // Remove notification after handling
            await remove(ref(database, `users/${currentUser.uid}/notifications/${notification.id}`));

        } catch (error) {
            console.error("Invite response error:", error);
            toast({ variant: 'destructive', title: 'Action Failed' });
        } finally {
            setUpdatingInvite(null);
        }
    };


    return (
        <div className="space-y-8 max-w-3xl mx-auto">
            <div className="flex items-center gap-4">
                <Bell className="h-8 w-8 text-primary"/>
                <h1 className="text-4xl font-headline font-bold">Notifications</h1>
            </div>

            {loading ? (
                <div className="space-y-4">
                    {Array.from({length: 5}).map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                    ))}
                </div>
            ) : notifications.length > 0 ? (
                <div className="space-y-4">
                    {notifications.map(notification => {
                        const Icon = notificationIcons[notification.type] || Bell;
                        const isUpdating = updatingInvite === notification.id;
                        return (
                            <Card key={notification.id} className={cn("hover:bg-card/80 transition-colors", !notification.isRead && "border-primary/30")}>
                                <CardContent className="p-4 flex items-center gap-4">
                                    <Icon className="h-6 w-6 text-primary shrink-0" />
                                    <div className="flex-grow">
                                        <p>{notification.message}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {notification.createdAt ? formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true }) : 'just now'}
                                        </p>
                                    </div>
                                    {notification.type === 'studio_invite' ? (
                                        <div className="flex gap-2">
                                            {isUpdating ? <Loader2 className="animate-spin" /> : (
                                                <>
                                                    <Button size="icon" className="h-8 w-8 bg-green-500 hover:bg-green-600" onClick={() => handleInviteResponse(notification, true)}>
                                                        <Check className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" className="h-8 w-8" variant="destructive" onClick={() => handleInviteResponse(notification, false)}>
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <Button asChild variant="ghost" size="sm">
                                            <Link href={notification.link || '#'}>View</Link>
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-16 border-2 border-dashed rounded-lg">
                    <h2 className="text-2xl font-semibold text-muted-foreground">No new notifications.</h2>
                    <p className="mt-2 text-muted-foreground">You're all caught up!</p>
                </div>
            )}
        </div>
    );
}
