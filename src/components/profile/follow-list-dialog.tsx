// src/components/profile/follow-list-dialog.tsx
"use client";

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { database } from '@/lib/firebase-config';
import { ref, get } from 'firebase/database';
import { Loader2, User } from 'lucide-react';
import type { UserProfile } from '@/types/user';
import { ScrollArea } from '@/components/ui/scroll-area';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Button } from '../ui/button';

interface FollowListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  type: 'followers' | 'following';
}

export function FollowListDialog({ open, onOpenChange, userId, type }: FollowListDialogProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchFollowList = async () => {
      if (!open || !userId) return;
      setLoading(true);
      setUsers([]);

      try {
        const userRef = ref(database, `users/${userId}`);
        const userSnapshot = await get(userRef);
        if (!userSnapshot.exists()) {
          toast({ variant: 'destructive', title: 'User not found' });
          return;
        }

        const listIds = userSnapshot.val()[type === 'followers' ? 'followersList' : 'followingList'];
        if (!listIds) {
          return; // No followers or following
        }

        const userIds = Object.keys(listIds);
        const userPromises = userIds.map(id => get(ref(database, `users/${id}`)));
        const userSnapshots = await Promise.all(userPromises);
        
        const userData = userSnapshots
            .map(snap => snap.exists() ? { uid: snap.key, ...snap.val() } as UserProfile : null)
            .filter(Boolean) as UserProfile[];
            
        setUsers(userData);

      } catch (error) {
        console.error(`Failed to fetch ${type}:`, error);
        toast({ variant: 'destructive', title: `Failed to fetch ${type}` });
      } finally {
        setLoading(false);
      }
    };

    fetchFollowList();
  }, [open, userId, type, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline capitalize">{type}</DialogTitle>
          <DialogDescription>
            A list of users {type === 'followers' ? 'who follow this user' : 'this user follows'}.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-72">
            <div className="p-1 pr-4">
              {loading ? (
                <div className="flex justify-center items-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : users.length > 0 ? (
                <div className="space-y-2">
                    {users.map(user => (
                        <div key={user.uid} className="flex items-center justify-between">
                            <Link href={`/${user.username}`} passHref>
                                <Button variant="ghost" className="h-auto p-2 w-full justify-start" onClick={() => onOpenChange(false)}>
                                    <div className="flex items-center gap-3 text-left">
                                        <Avatar>
                                            <AvatarImage src={user.avatarUrl} alt={user.name} />
                                            <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-semibold">{user.name}</p>
                                            <p className="text-sm text-muted-foreground">@{user.username}</p>
                                        </div>
                                    </div>
                                </Button>
                            </Link>
                        </div>
                    ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-10">
                    <User className="h-10 w-10 mb-2"/>
                    <p>No {type} found.</p>
                </div>
              )}
            </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
