// src/app/chat/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { auth, database } from "@/lib/firebase-config";
import { ref, onValue, query, orderByChild, limitToLast } from "firebase/database";
import type { Message, Chat } from "@/types/chat";
import ChatLayout from "@/components/chat/chat-layout";
import ChatMessages from "@/components/chat/chat-messages";
import { Skeleton } from "@/components/ui/skeleton";
import type { User } from "firebase/auth";

export default function ChatConversationPage() {
  const params = useParams();
  const chatId = params.id as string;
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInfo, setChatInfo] = useState<Chat | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(user => {
        setCurrentUser(user);
    });
    return () => unsubscribeAuth();
  }, [])

  useEffect(() => {
    if (!chatId) return;
    setLoading(true);

    const messagesRef = query(
      ref(database, `messages/${chatId}`),
      orderByChild("timestamp"),
      limitToLast(100)
    );

    const chatRef = ref(database, `chats/${chatId}`);

    const unsubscribeMessages = onValue(messagesRef, (snapshot) => {
      const messagesData: Message[] = [];
      snapshot.forEach((child) => {
        messagesData.push({ id: child.key!, ...child.val() });
      });
      setMessages(messagesData);
      setLoading(false);
    });

    const unsubscribeChatInfo = onValue(chatRef, (snapshot) => {
        if (snapshot.exists()) {
            setChatInfo({ id: snapshot.key, ...snapshot.val() });
        }
    });


    return () => {
        unsubscribeMessages();
        unsubscribeChatInfo();
    };
  }, [chatId]);
  
  if (loading) {
    return (
       <ChatLayout>
         <div className="space-y-4 p-4">
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="h-16 w-3/4 ml-auto" />
            <Skeleton className="h-16 w-2/4" />
         </div>
       </ChatLayout>
    )
  }

  return (
    <ChatLayout>
      {currentUser && chatInfo ? (
        <ChatMessages messages={messages} currentUser={currentUser} chatInfo={chatInfo} />
      ) : (
         <div className="p-4 text-center text-muted-foreground">Loading chat...</div>
      )}
    </ChatLayout>
  );
}
