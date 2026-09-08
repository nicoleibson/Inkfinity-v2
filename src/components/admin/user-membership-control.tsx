// src/components/admin/user-membership-control.tsx
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { auth, EmailAuthProvider } from '@/lib/firebase-config';
import { reauthenticateWithCredential } from 'firebase/auth';
import type { UserProfile } from '@/types/user';
import { Loader2, ShieldAlert, Sparkles } from 'lucide-react';
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
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { extendUserMembership } from '@/lib/actions/user-actions';
import { format } from 'date-fns';

interface UserMembershipControlProps {
  user: UserProfile & { uid: string };
  onSuccess: () => void;
}

export function UserMembershipControl({ user, onSuccess }: UserMembershipControlProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();
  
  const canExtend = ['Tattoo Artist', 'Studio', 'Supply Store'].includes(user.role);

  const handleReauthAndExtend = async () => {
    const adminUser = auth.currentUser;
    if (!adminUser || !adminUser.email) {
      toast({ variant: 'destructive', title: 'Authentication Error' });
      return;
    }
    
    setIsUpdating(true);
    try {
      const credential = EmailAuthProvider.credential(adminUser.email, password);
      await reauthenticateWithCredential(adminUser, credential);
      
      const result = await extendUserMembership(user.uid);

      if (result.success) {
        toast({ title: 'Membership Extended', description: `${user.name}'s membership has been extended by one year.` });
        onSuccess();
      } else {
        throw new Error(result.error || 'The server action failed.');
      }
      
      setIsDialogOpen(false);
    } catch (error: any) {
      console.error('Membership extension failed:', error);
      toast({ 
        variant: 'destructive', 
        title: 'Update Failed', 
        description: error.message || 'An unexpected error occurred.'
      });
    } finally {
      setIsUpdating(false);
      setPassword('');
    }
  };

  if (!canExtend) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
       {user.trialEndsAt ? (
            <p className="text-sm">
                Expires: {format(new Date(user.trialEndsAt), 'PPP')}
            </p>
       ) : (
            <p className="text-sm text-muted-foreground">No active membership</p>
       )}
      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Sparkles className="mr-2 h-4 w-4" />
              Extend 1 Year
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2"><ShieldAlert className="text-destructive"/> Confirm Membership Extension</AlertDialogTitle>
              <AlertDialogDescription>
                This will extend {user.name}'s membership by one year. To confirm this action, please enter your password.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="password-extend">Password</Label>
              <Input id="password-extend" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPassword('')}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleReauthAndExtend} disabled={isUpdating || !password}>
                {isUpdating ? <Loader2 className="animate-spin"/> : "Confirm & Extend"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </div>
  );
}