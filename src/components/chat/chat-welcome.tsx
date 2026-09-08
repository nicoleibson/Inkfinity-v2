// src/components/chat/chat-welcome.tsx
"use client";

import { MessageSquare, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function ChatWelcome() {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MessageSquare className="h-8 w-8" />
            </div>
            <div>
                <h2 className="text-2xl font-bold">Your Inbox is Empty</h2>
                <p className="text-muted-foreground mt-2 max-w-sm">
                    It looks like you don't have any conversations yet. Start one by finding an artist or studio to connect with.
                </p>
            </div>
            <div className="flex gap-4 mt-4">
                <Button asChild>
                    <Link href="/search?cat=artist">
                        <Search className="mr-2 h-4 w-4" />
                        Find Artists
                    </Link>
                </Button>
                 <Button asChild variant="secondary">
                    <Link href="/search?cat=studio">
                        <Search className="mr-2 h-4 w-4" />
                        Find Studios
                    </Link>
                </Button>
            </div>
        </div>
    )
}
