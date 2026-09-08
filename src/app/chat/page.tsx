// src/app/chat/page.tsx
"use client";

import { MessageSquare } from "lucide-react";
import ChatLayout from "@/components/chat/chat-layout";

export default function ChatPage() {
  return (
    <ChatLayout>
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MessageSquare className="h-8 w-8" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold">Welcome to your Inbox</h2>
          <p className="text-muted-foreground">
            Select a conversation to start messaging.
          </p>
        </div>
      </div>
    </ChatLayout>
  );
}
