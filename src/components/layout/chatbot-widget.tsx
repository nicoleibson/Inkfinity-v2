"use client";

import { useState, useEffect } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { auth } from '@/lib/firebase-config';
import { onAuthStateChanged, type User } from 'firebase/auth';

export function ChatbotWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // No renderizar nada si el usuario no está logueado o está cargando el estado de auth
    if (loading || !user) {
        return null;
    }

    return (
        <div className="fixed bottom-5 right-5 z-[1000] flex flex-col items-end">
            {isOpen ? (
                <Card 
                    className="w-[calc(100vw-40px)] sm:w-[380px] h-[500px] sm:h-[600px] flex flex-col shadow-2xl border-primary/20 bg-card overflow-hidden transition-all duration-300 ease-in-out" 
                    style={{ borderRadius: '30px' }}
                >
                    <div className="flex justify-between items-center p-3 border-b bg-card/50 backdrop-blur-md">
                        <div className="flex items-center gap-2 ml-2">
                            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="font-headline font-bold text-primary text-sm sm:text-base">InkFlow Assistant</span>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="rounded-full hover:bg-muted">
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                    <div className="flex-grow bg-background">
                        <iframe 
                            src="https://inkflow-666.web.app?mode=widget" 
                            className="w-full h-full border-none"
                            title="Chatbot Assistant"
                        />
                    </div>
                </Card>
            ) : (
                <Button 
                    onClick={() => setIsOpen(true)}
                    size="icon"
                    className="rounded-full h-10 w-10 sm:h-12 sm:w-12 shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 bg-primary text-primary-foreground"
                >
                    <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6" />
                </Button>
            )}
        </div>
    );
}
