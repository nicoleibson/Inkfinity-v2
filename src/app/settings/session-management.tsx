// src/app/settings/session-management.tsx
"use client";

import { useEffect, useState, useMemo } from 'react';
import { Card, CardDescription, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { auth, database, EmailAuthProvider } from '@/lib/firebase-config';
import { ref, onValue, set, get } from 'firebase/database';
import { User as FirebaseUser, reauthenticateWithCredential } from 'firebase/auth';
import { Laptop, Loader2, LogOut, Smartphone, ShieldAlert } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Session = {
  id: string;
  startedAt: string;
  userAgent: string;
  isCurrent: boolean;
};

interface SessionManagementProps {
  currentUser: FirebaseUser;
}

const parseUserAgent = (ua: string) => {
    let browser = 'Unknown Browser';
    let os = 'Unknown OS';

    if (!ua) {
        return { browser, os, isMobile: false };
    }

    if (ua.includes('Win')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('like Mac')) os = 'iOS';

    if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('SamsungBrowser')) browser = 'Samsung Internet';
    else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';
    else if (ua.includes('Trident')) browser = 'Internet Explorer';
    else if (ua.includes('Edge')) browser = 'Edge';
    else if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Safari')) browser = 'Safari';
    
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

    return { browser, os, isMobile };
};

export function SessionManagement({ currentUser }: SessionManagementProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [password, setPassword] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  
  const currentSessionId = useMemo(() => sessionStorage.getItem('sessionId'), []);

  useEffect(() => {
    if (!currentUser) return;

    const sessionsRef = ref(database, `userSessions/${currentUser.uid}`);
    const unsubscribe = onValue(sessionsRef, (snapshot) => {
      const sessionsData: Session[] = [];
      if (snapshot.exists()) {
        snapshot.forEach(childSnapshot => {
          const data = childSnapshot.val();
          sessionsData.push({
            id: childSnapshot.key!,
            ...data,
            isCurrent: childSnapshot.key === currentSessionId,
          });
        });
      }
      setSessions(sessionsData.sort((a, b) => (a.isCurrent ? -1 : b.isCurrent ? 1 : 0)));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser, currentSessionId]);

  const handleSignOutConfirm = async () => {
    if (!currentUser || !currentUser.email || !currentSessionId) return;

    setIsSigningOut(true);

    try {
        const credential = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, credential);
        
        // Reauth successful, proceed to sign out others
        const sessionsRef = ref(database, `userSessions/${currentUser.uid}`);
        const snapshot = await get(sessionsRef);

        if (snapshot.exists()) {
            const allSessions = snapshot.val();
            const currentSessionData = allSessions[currentSessionId];
            
            if (currentSessionData) {
                // Overwrite with only the current session
                await set(sessionsRef, { [currentSessionId]: currentSessionData });
                toast({ title: 'Success', description: 'All other sessions have been signed out.' });
            }
        }

    } catch (error) {
        console.error("Sign out others error:", error);
        toast({ variant: 'destructive', title: 'Authentication Failed', description: 'The password you entered is incorrect.' });
    } finally {
        setIsSigningOut(false);
        setPassword('');
        setIsDialogOpen(false);
    }
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Active Sessions</CardTitle>
        <CardDescription>
          This is a list of devices that have logged into your account.
          Revoke any sessions that you do not recognize.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : sessions.length > 0 ? (
          sessions.map(session => {
            const { browser, os, isMobile } = parseUserAgent(session.userAgent);
            return (
              <div key={session.id} className="flex items-center justify-between p-3 rounded-md border">
                <div className="flex items-center gap-4">
                  {isMobile ? <Smartphone className="h-6 w-6 text-muted-foreground" /> : <Laptop className="h-6 w-6 text-muted-foreground" />}
                  <div>
                    <p className="font-medium">{browser} on {os}</p>
                    <p className="text-sm text-muted-foreground">
                      {session.startedAt ? `Active ${formatDistanceToNow(new Date(session.startedAt), { addSuffix: true })}` : 'Active just now'}
                    </p>
                  </div>
                </div>
                {session.isCurrent && (
                  <span className="text-sm font-semibold text-primary">This device</span>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No active sessions found.</p>
        )}
      </CardContent>
      <CardFooter>
        <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <AlertDialogTrigger asChild>
                <Button 
                    variant="destructive" 
                    disabled={isSigningOut || sessions.length <= 1}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out From All Other Devices
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        <ShieldAlert className="inline-block mr-2"/>
                        Confirm Action
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      For your security, please enter your password to sign out from all other devices.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2">
                    <Label htmlFor="session-password">Password</Label>
                    <Input 
                        id="session-password" 
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password..."
                    />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setPassword('')}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSignOutConfirm} disabled={isSigningOut || !password}>
                      {isSigningOut && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                      Confirm & Sign Out
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}
