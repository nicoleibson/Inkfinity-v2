// src/components/admin/user-sync.tsx
"use client";

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { auth, EmailAuthProvider } from '@/lib/firebase-config';
import { getFunctions, httpsCallable } from "firebase/functions";
import { reauthenticateWithCredential } from 'firebase/auth';
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
import { Loader2, ShieldAlert, UsersRound as UserSyncIcon } from 'lucide-react';
import { app } from '@/lib/firebase-config'; // Import the initialized app

// Get a reference to the Firebase Functions service
const functions = getFunctions(app);

export function UserSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [password, setPassword] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const handleSyncConfirm = async () => {
    const user = auth.currentUser;
    if (!user || !user.email) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'No authenticated user found.',
      });
      return;
    }

    setIsSyncing(true);
    
    try {
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
        
        await handleSync();
        
    } catch (err: any) {
        console.error(err);
        toast({
            variant: 'destructive',
            title: 'Authentication Failed',
            description: 'The password you entered is incorrect. Please try again.',
        });
    } finally {
        setIsSyncing(false);
        setPassword('');
        setIsDialogOpen(false);
    }
  };

  const handleSync = async () => {
    toast({ title: 'Starting User Sync...', description: 'This may take a moment...' });
    
    try {
        const syncUsersFunction = httpsCallable(functions, 'syncUsers');
        const result = await syncUsersFunction();
        
        const data = result.data as { success: boolean; usersCleaned: number; message: string };

        if (data.success) {
            toast({
                title: 'Sync Complete',
                description: data.message || `Cleaned ${data.usersCleaned} orphaned user(s).`,
            });
        } else {
            throw new Error('The sync function reported an issue.');
        }

    } catch (error: any) {
        console.error("User sync function call failed:", error);
        toast({
            variant: 'destructive',
            title: 'Sync Failed',
            description: error.message || 'An unexpected error occurred while calling the sync function.',
            duration: 10000,
        });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Data Integrity</CardTitle>
        <CardDescription>
          Synchronize the user database with Firebase Authentication to remove orphaned accounts. This action is irreversible and requires password confirmation.
        </CardDescription>
      </CardHeader>
      <CardContent>
         <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <AlertDialogTrigger asChild>
                <Button variant="destructive">
                    <UserSyncIcon className="mr-2 h-4 w-4" />
                    Sync Authenticated Users
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  <ShieldAlert className="inline-block mr-2 text-destructive"/>
                  Confirm User Synchronization
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will scan for and remove all users from the database that no longer exist in Firebase Authentication, including their stored files. <span className="font-bold">This action cannot be undone.</span> For security, please enter your password to proceed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <Label htmlFor="sync-password">Password</Label>
                <Input 
                    id="sync-password" 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password..."
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setPassword('')}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleSyncConfirm} disabled={isSyncing || !password}>
                  {isSyncing && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                  Confirm & Sync
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
      </CardContent>
    </Card>
  );
}
