// src/components/chat/chat-header.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { auth, database } from "@/lib/firebase-config";
import { ref, onValue } from "firebase/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { Chat } from "@/types/chat";
import type { User } from "firebase/auth";

export function ChatHeader() {
  const [chatInfo, setChatInfo] = useState<Chat | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const params = useParams();
  const chatId = params.id as string;

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!chatId) return;

    const chatRef = ref(database, `chats/${chatId}`);
    const unsubscribe = onValue(chatRef, (snapshot) => {
      if (snapshot.exists()) {
        setChatInfo({ id: snapshot.key!, ...snapshot.val() });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [chatId]);

  if (loading) {
    return (
      <div className="p-4 border-b flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-6 w-24" />
      </div>
    );
  }

  if (!chatInfo || !currentUser) {
    return null;
  }

  const otherParticipantId = Object.keys(chatInfo.participants).find(id => id !== currentUser.uid);
  if (!otherParticipantId) return null;

  const otherUserInfo = chatInfo.participantInfo[otherParticipantId];
  if (!otherUserInfo) return null;

  return (
    <div className="p-4 border-b flex items-center gap-3 bg-card">
      <Avatar>
        <AvatarImage src={otherUserInfo.avatarUrl} />
        <AvatarFallback>{otherUserInfo.name.charAt(0)}</AvatarFallback>
      </Avatar>
      <h2 className="text-lg font-bold font-headline">{otherUserInfo.name}</h2>
    </div>
  );
}
