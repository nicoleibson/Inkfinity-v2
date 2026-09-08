// src/components/chat/chat-messages.tsx
"use client";

import { useRef, useEffect } from 'react';
import type { Message, Chat } from '@/types/chat';
import type { User } from 'firebase/auth';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import ChatInput from './chat-input';

interface ChatMessagesProps {
  messages: Message[];
  currentUser: User;
  chatInfo: Chat;
}

export default function ChatMessages({ messages, currentUser, chatInfo }: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => {
          const isCurrentUser = message.senderId === currentUser.uid;
          const showAvatar = index === 0 || messages[index - 1].senderId !== message.senderId;
          const senderInfo = chatInfo.participantInfo[message.senderId];

          return (
            <div
              key={message.id}
              className={cn(
                "flex items-end gap-2",
                isCurrentUser ? "justify-end" : "justify-start"
              )}
            >
              {!isCurrentUser && (
                 <div className="w-8 shrink-0">
                    {showAvatar && senderInfo && (
                        <Avatar className="h-8 w-8">
                            <AvatarImage src={senderInfo.avatarUrl} /> 
                            <AvatarFallback>{senderInfo.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                    )}
                 </div>
              )}
              <div
                className={cn(
                  "max-w-xs md:max-w-md lg:max-w-lg rounded-lg px-4 py-2",
                  isCurrentUser
                    ? "bg-primary text-primary-foreground rounded-br-none"
                    : "bg-muted rounded-bl-none"
                )}
              >
                <p>{message.text}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 border-t bg-card">
        <ChatInput />
      </div>
    </div>
  );
}
