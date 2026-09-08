// src/hooks/useUserSession.tsx
"use client";

import { useEffect, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, database } from '@/lib/firebase-config';
import { ref, onValue, set, push, onDisconnect, serverTimestamp } from 'firebase/database';
import { useToast } from './use-toast';
import { AlertTriangle } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import type { UserProfile } from '@/types/user';

export function useUserSession(userProfile?: UserProfile | null) {
    const { toast } = useToast();
    const notificationShownRef = useRef(false);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            if (user) {
                 // --- Start of Session Management Logic ---
                let sessionId = sessionStorage.getItem('sessionId');
                if (!sessionId) {
                    const newSessionRef = push(ref(database));
                    sessionId = newSessionRef.key;
                    if (sessionId) {
                        sessionStorage.setItem('sessionId', sessionId);
                    }
                }

                if (!sessionId) return; // Should not happen

                const sessionRef = ref(database, `userSessions/${user.uid}/${sessionId}`);
                
                // Listen for removal of this specific session node
                const unsubscribeSessionTermination = onValue(sessionRef, (snapshot) => {
                    if (!snapshot.exists()) {
                        signOut(auth).catch(error => console.error("Sign out after session termination failed:", error));
                    }
                });
                
                const sessionData = {
                    startedAt: serverTimestamp(),
                    userAgent: navigator.userAgent
                };

                set(sessionRef, sessionData).catch(error => console.error("Failed to set session data:", error));
                onDisconnect(sessionRef).remove();
                // --- End of Session Management Logic ---


                const sessionsRef = ref(database, `userSessions/${user.uid}`);
                const unsubscribeSessions = onValue(sessionsRef, (snapshot) => {
                    if (snapshot.exists() && snapshot.size > 1) {
                        // To prevent spamming toasts, we show it only once per session.
                        if (!notificationShownRef.current) {
                           toast({
                                title: "Multiple Sessions Active",
                                description: "Your account is logged in on more than one device. For security, review active sessions in your settings.",
                           });
                           notificationShownRef.current = true;
                        }
                    }
                });

                // Cleanup session listener when auth state changes
                return () => {
                    unsubscribeSessions();
                    unsubscribeSessionTermination();
                }
            } else {
                notificationShownRef.current = false; // Reset on logout
                sessionStorage.removeItem('sessionId');
            }
        });

        return () => unsubscribeAuth();
    }, [toast]);
    
    // --- Start of Payment Status Check Logic (now uses passed profile) ---
    useEffect(() => {
        if (userProfile) {
            const essentialPages = ['/payment', '/login', '/signup', '/settings'];
            if (userProfile.status === 'pending_payment' && !essentialPages.includes(pathname)) {
                router.push('/payment');
            }
        }
    }, [userProfile, pathname, router]);
}
