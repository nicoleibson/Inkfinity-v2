// src/app/dashboard/studio/page.tsx
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, UserPlus, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth, database } from '@/lib/firebase-config';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, get, query, orderByChild, equalTo, update, push, serverTimestamp } from 'firebase/database';
import type { UserProfile, Notification } from '@/types/user';
import { useRouter } from 'next/navigation';
import { ArtistResultCard } from '@/components/search/artist-result-card';

export default function StudioDashboardPage() {
    const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
    const [loadingUser, setLoadingUser] = useState(true);
    const [searchUsername, setSearchUsername] = useState('');
    const [searchResult, setSearchResult] = useState<UserProfile | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isInviting, setIsInviting] = useState(false);
    const [residentArtists, setResidentArtists] = useState<UserProfile[]>([]);
    const { toast } = useToast();
    const router = useRouter();

    const fetchResidentArtists = useCallback(async (artistIds: string[]) => {
        const artistPromises = artistIds.map(id => get(ref(database, `users/${id}`)));
        const snapshots = await Promise.all(artistPromises);
        const artistsData = snapshots.map(snap => snap.exists() ? { uid: snap.key!, ...snap.val() } as UserProfile : null).filter(Boolean) as UserProfile[];
        setResidentArtists(artistsData);
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                const userRef = ref(database, `users/${user.uid}`);
                const snapshot = await get(userRef);

                if (snapshot.exists()) {
                    const profile: UserProfile = { uid: user.uid, ...snapshot.val() };
                    setCurrentUser(profile);
                    if (profile.role !== 'Studio') {
                        toast({ variant: 'destructive', title: 'Access Denied' });
                        router.push('/dashboard');
                        return;
                    }
                    if (profile.residentArtists) {
                        fetchResidentArtists(Object.keys(profile.residentArtists));
                    }
                } else {
                    router.push('/login');
                }
            } else {
                router.push('/login');
            }
            setLoadingUser(false);
        });
        return () => unsubscribe();
    }, [router, toast, fetchResidentArtists]);


    const handleSearchArtist = async () => {
        if (!searchUsername.trim()) return;
        setIsSearching(true);
        setSearchResult(null);
        try {
            const usernamesRef = ref(database, 'usernames');
            const usernameSnapshot = await get(ref(database, `usernames/${searchUsername.trim().toLowerCase()}`));

            if (!usernameSnapshot.exists()) {
                toast({ variant: 'destructive', title: 'Artist Not Found' });
                setSearchResult(null);
                return;
            }

            const uid = usernameSnapshot.val();
            const userSnapshot = await get(ref(database, `users/${uid}`));
            if (userSnapshot.exists() && userSnapshot.val().role === 'Tattoo Artist') {
                setSearchResult({ uid, ...userSnapshot.val() });
            } else {
                toast({ variant: 'destructive', title: 'User is not a Tattoo Artist' });
                setSearchResult(null);
            }
        } catch (error) {
            console.error("Artist search error:", error);
            toast({ variant: 'destructive', title: 'Search Failed' });
        } finally {
            setIsSearching(false);
        }
    };

    const handleInviteArtist = async () => {
        if (!searchResult || !currentUser) return;
        setIsInviting(true);
        try {
            const inviteRefKey = push(ref(database, `users/${searchResult.uid}/studioInvites`)).key;
            if(!inviteRefKey) throw new Error("Could not generate invite key");

            const notificationRefKey = push(ref(database, `users/${searchResult.uid}/notifications`)).key;
            if(!notificationRefKey) throw new Error("Could not generate notification key");
            
            const inviteData = {
                fromStudioId: currentUser.uid,
                fromStudioName: currentUser.name,
                status: 'pending'
            };

            const notificationData: Omit<Notification, 'id'> = {
                type: 'studio_invite',
                fromUserId: currentUser.uid,
                fromUserName: currentUser.name,
                message: `You have been invited to join ${currentUser.name}.`,
                isRead: false,
                createdAt: serverTimestamp(),
                inviteId: inviteRefKey
            };

            const updates: { [key: string]: any } = {};
            updates[`/users/${searchResult.uid}/studioInvites/${inviteRefKey}`] = inviteData;
            updates[`/users/${searchResult.uid}/notifications/${notificationRefKey}`] = notificationData;

            await update(ref(database), updates);

            toast({ title: 'Invitation Sent!', description: `${searchResult.name} has been invited to join your studio.` });
            setSearchUsername('');
            setSearchResult(null);
        } catch (error) {
            console.error("Invite error:", error);
            toast({ variant: 'destructive', title: 'Invitation Failed' });
        } finally {
            setIsInviting(false);
        }
    };

    if (loadingUser) {
        return <div className="flex justify-center items-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-headline font-bold">Manage Artists</h1>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                    <Card>
                        <CardHeader>
                            <CardTitle>Invite an Artist</CardTitle>
                            <CardDescription>Search for an artist by their username to invite them to your studio.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex gap-2">
                                <Input
                                    id="username"
                                    placeholder="Enter artist's username"
                                    value={searchUsername}
                                    onChange={(e) => setSearchUsername(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearchArtist()}
                                />
                                <Button onClick={handleSearchArtist} disabled={isSearching}>
                                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4" />}
                                </Button>
                            </div>
                            {searchResult && (
                                <div className="space-y-4 pt-4 border-t">
                                    <ArtistResultCard user={searchResult} />
                                    <Button className="w-full" onClick={handleInviteArtist} disabled={isInviting}>
                                        {isInviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <UserPlus className="mr-2 h-4 w-4" />}
                                        {isInviting ? 'Sending Invite...' : `Invite ${searchResult.name}`}
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Resident Artists</CardTitle>
                            <CardDescription>The artists currently part of your studio.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {residentArtists.length > 0 ? (
                                <div className="space-y-4">
                                    {residentArtists.map(artist => (
                                        <ArtistResultCard key={artist.uid} user={artist} />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-muted-foreground text-center py-8">You have no resident artists yet.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
