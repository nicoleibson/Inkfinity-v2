// src/components/chat/chat-layout.tsx
"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { auth, database } from '@/lib/firebase-config';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { ref, onValue, get } from 'firebase/database';
import type { Chat } from '@/types/chat';
import ChatList from "./chat-list";
import { ChatHeader } from './chat-header';
import { ChatWelcome } from "./chat-welcome";
import { Skeleton } from '../ui/skeleton';
import { MessageSquare } from 'lucide-react';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const chatId = params.id as string;
  
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user: FirebaseUser | null) => {
      if (user) {
        // This path is now consistent with the user profile data model
        const userChatsRef = ref(database, `users/${user.uid}/chats`);
        
        const unsubscribeUserChats = onValue(userChatsRef, async (snapshot) => {
          if (!snapshot.exists()) {
            setChats([]);
            setLoading(false);
            return;
          }

          const chatIds = Object.keys(snapshot.val());
          const chatPromises = chatIds.map((id) => get(ref(database, `chats/${id}`)));
          const chatSnapshots = await Promise.all(chatPromises);

          const chatsData: Chat[] = chatSnapshots
            .map((snap) => (snap.exists() ? { id: snap.key!, ...snap.val() } : null))
            .filter((chat): chat is Chat => chat !== null && !!chat.participants)
            .sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0));
          
          setChats(chatsData);
          setLoading(false);
        });

        return () => unsubscribeUserChats();

      } else {
        setChats([]);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 h-[calc(100vh-10rem)] border rounded-lg overflow-hidden">
      <div className="md:col-span-1 lg:col-span-1 border-r flex flex-col">
        <ChatList chats={chats} loading={loading} />
      </div>
      <div className="md:col-span-2 lg:col-span-3 flex flex-col h-full">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Skeleton className="h-24 w-24 rounded-full" />
          </div>
        ) : chatId ? (
          <>
            <ChatHeader />
            {children}
          </>
        ) : chats.length > 0 ? (
           <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MessageSquare className="h-8 w-8" />
              </div>
              <div>
                  <h2 className="text-2xl font-bold">Select a conversation</h2>
                  <p className="text-muted-foreground mt-2 max-w-sm">
                      Choose one of your existing conversations from the list to continue messaging.
                  </p>
              </div>
          </div>
        ) : (
          <ChatWelcome />
        )}
      </div>
    </div>
  );
}
