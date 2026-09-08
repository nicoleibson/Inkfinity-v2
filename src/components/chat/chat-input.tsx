// src/components/chat/chat-input.tsx
"use client";

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { SendHorizonal } from 'lucide-react';
import { auth, database } from '@/lib/firebase-config';
import { ref, push, serverTimestamp, update, get } from 'firebase/database';
import type { Chat } from '@/types/chat';
import type { UserProfile, Notification } from '@/types/user';

export default function ChatInput() {
  const [message, setMessage] = useState('');
  const params = useParams();
  const chatId = params.id as string;

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() === '' || !chatId || !auth.currentUser) {
      return;
    }

    const currentUser = auth.currentUser;
    const chatRef = ref(database, `chats/${chatId}`);
    const updates: { [key: string]: any } = {};

    try {
      const chatSnapshot = await get(chatRef);
      let recipientId: string | undefined;

      // If chat doesn't exist, this is the first message. We must create the chat.
      if (!chatSnapshot.exists()) {
        const ids = chatId.split('_');
        recipientId = ids.find(id => id !== currentUser.uid);

        if (!recipientId) {
          console.error("Could not determine recipient from chatId.");
          return;
        }

        const recipientSnap = await get(ref(database, `users/${recipientId}`));
        const senderSnap = await get(ref(database, `users/${currentUser.uid}`));

        if (!recipientSnap.exists() || !senderSnap.exists()) {
          console.error("Could not find user profiles for chat creation.");
          return;
        }

        const recipientData: UserProfile = recipientSnap.val();
        const senderData: UserProfile = senderSnap.val();

        // 1. Define the new chat's structure.
        const newChatData: Partial<Chat> = {
          createdAt: serverTimestamp(),
          participants: {
            [currentUser.uid]: true,
            [recipientId]: true,
          },
          participantInfo: {
            [currentUser.uid]: {
              name: senderData.name,
              avatarUrl: senderData.avatarUrl || '',
            },
            [recipientId]: {
              name: recipientData.name,
              avatarUrl: recipientData.avatarUrl || '',
            },
          },
        };
        updates[`/chats/${chatId}`] = newChatData;

        // The user can only write to their own user record.
        updates[`/users/${currentUser.uid}/chats/${chatId}`] = true;
        // Writing to the recipient's user record from the client is not allowed by security rules.
        // A backend function should listen for new chats and add the chat to the recipient's list.
        // updates[`/users/${recipientId}/chats/${chatId}`] = true;

      } else {
        // Chat already exists, just get the recipientId
        const chatData: Chat = chatSnapshot.val();
        recipientId = Object.keys(chatData.participants).find(id => id !== currentUser.uid);
      }

      if (!recipientId) {
        console.error("Recipient ID could not be determined.");
        return;
      }

      const messagesRef = ref(database, `messages/${chatId}`);
      const newMessageKey = push(messagesRef).key;
      if (!newMessageKey) throw new Error("Could not generate new message key.");

      const messageData = {
        senderId: currentUser.uid,
        text: message,
        timestamp: serverTimestamp(),
        isRead: false,
      };

      // 2. Add the new message to the updates object
      updates[`/messages/${chatId}/${newMessageKey}`] = messageData;

      // 3. Update the lastMessage for the chat object
      updates[`/chats/${chatId}/lastMessage`] = {
        text: message,
        timestamp: serverTimestamp(),
        senderId: currentUser.uid,
      };

      // 4. Create a notification for the recipient
      // This is also not allowed from the client. A backend function is the secure way to handle this.
      /*
      const notificationsRef = ref(database, `users/${recipientId}/notifications`);
      const newNotificationKey = push(notificationsRef).key;
      if (newNotificationKey) {
        const newNotification: Omit<Notification, 'id'> = {
          type: 'chat_message',
          fromUserId: currentUser.uid,
          fromUserName: currentUser.displayName || 'A user',
          message: `You have a new message from ${currentUser.displayName || 'A user'}.`,
          isRead: false,
          createdAt: serverTimestamp(),
          link: `/chat/${chatId}`,
        };
        updates[`/users/${recipientId}/notifications/${newNotificationKey}`] = newNotification;
      }
      */

      // Atomically write all updates.
      await update(ref(database), updates);

      setMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  return (
    <form onSubmit={handleSendMessage} className="flex items-center gap-2">
      <Input
        type="text"
        placeholder="Type a message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        autoComplete="off"
      />
      <Button type="submit" size="icon" disabled={message.trim() === ''}>
        <SendHorizonal />
        <span className="sr-only">Send</span>
      </Button>
    </form>
  );
}
