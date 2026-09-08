// src/components/chat/chat-list.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { auth, database } from "@/lib/firebase-config";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Chat } from "@/types/chat";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { Button } from "../ui/button";
import { Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ref, update } from "firebase/database";
import { useToast } from "@/hooks/use-toast";

interface ChatListProps {
    chats: Chat[];
    loading: boolean;
}

export default function ChatList({ chats, loading }: ChatListProps) {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleDeleteChat = async (chatId: string) => {
    if (!currentUser) return;
    setIsDeleting(chatId);

    try {
        // Soft delete: just remove the chat reference from the user's list.
        // The chat data itself remains until the other user also deletes it,
        // and it can be re-activated if a new message is sent.
        const updates: { [key: string]: null } = {};
        updates[`/users/${currentUser.uid}/chats/${chatId}`] = null;
        
        await update(ref(database), updates);

        toast({
            title: "Conversation Hidden",
            description: "The chat has been removed from your list.",
        });

        if (params.id === chatId) {
            router.push('/chat');
        }

    } catch (error: any) {
        console.error("Failed to delete chat:", error);
        toast({
            variant: "destructive",
            title: "Deletion Failed",
            description: error.message || "Could not remove the conversation.",
        });
    } finally {
        setIsDeleting(null);
    }
  };


  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-1 w-full">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold font-headline">Conversations</h2>
      </div>
      <div className="flex-grow overflow-y-auto">
        {chats.length > 0 && currentUser ? (
          chats.map((chat) => {
            const otherParticipantId = Object.keys(chat.participants).find(id => id !== currentUser?.uid);
            if (!otherParticipantId) return null;

            const otherParticipantInfo = chat.participantInfo[otherParticipantId];
            const isActive = params.id === chat.id;

            return (
              <div key={chat.id} className="group relative">
                <Link
                    href={`/chat/${chat.id}`}
                    className={cn(
                    "block p-4 border-b hover:bg-muted/50",
                    isActive && "bg-muted"
                    )}
                >
                    <div className="flex items-center gap-3">
                    <Avatar>
                        <AvatarImage src={otherParticipantInfo?.avatarUrl} />
                        <AvatarFallback>{otherParticipantInfo?.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-grow overflow-hidden">
                        <p className="font-semibold truncate">{otherParticipantInfo?.name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                        {chat.lastMessage?.senderId === currentUser?.uid && "You: "}
                        {chat.lastMessage?.text}
                        </p>
                    </div>
                    </div>
                </Link>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                             <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isDeleting === chat.id}>
                                {isDeleting === chat.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive"/>}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Hide Conversation?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will remove the conversation from your list. It will reappear if you or the other person sends a new message.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => handleDeleteChat(chat.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                    Hide
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
              </div>
            );
          })
        ) : null}
      </div>
    </div>
  );
}
