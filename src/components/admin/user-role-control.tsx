// src/components/admin/user-role-control.tsx
"use client";

import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { auth, database, EmailAuthProvider } from '@/lib/firebase-config';
import { ref, update } from 'firebase/database';
import { reauthenticateWithCredential } from 'firebase/auth';
import type { UserProfile } from '@/types/user';
import { Loader2, Save, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface UserRoleControlProps {
  user: UserProfile & { uid: string };
  currentUserRole: UserProfile['role'];
  onSuccess: () => void;
}

const ROLES: UserProfile['role'][] = ['Client', 'Tattoo Artist', 'Studio', 'Supply Store', 'Administrator', 'Super-Administrator'];

export function UserRoleControl({ user, currentUserRole, onSuccess }: UserRoleControlProps) {
  const [selectedRole, setSelectedRole] = useState(user.role);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();
  
  const isSelf = auth.currentUser?.uid === user.uid;
  const canEditRole = currentUserRole === 'Super-Administrator' && !isSelf;
  const roleChanged = user.role !== selectedRole;

  const handleReauthAndUpdate = async () => {
    const adminUser = auth.currentUser;
    if (!adminUser || !adminUser.email) {
      toast({ variant: 'destructive', title: 'Authentication Error', description: 'Could not find the administrator session.' });
      return;
    }
    
    // Strengthened validation: Ensure user.uid is a non-empty string.
    if (!user || typeof user.uid !== 'string' || user.uid.trim() === '') {
      toast({ variant: 'destructive', title: 'Update Error', description: 'Target user ID is invalid or missing.' });
      return;
    }

    setIsUpdating(true);
    try {
      // Re-authenticate the administrator to confirm their identity.
      const credential = EmailAuthProvider.credential(adminUser.email, password);
      await reauthenticateWithCredential(adminUser, credential);
      
      // Use a multi-path update for robustness. This is the recommended pattern.
      const updates: { [key: string]: any } = {};
      const userRolePath = `/users/${user.uid}/role`;
      updates[userRolePath] = selectedRole;
      
      await update(ref(database), updates);
      
      toast({ title: 'Role Updated', description: `${user.name}'s role has been changed to ${selectedRole}.` });
      
      setIsDialogOpen(false);
      onSuccess(); // Callback to re-fetch data in parent
    } catch (error: any) {
      console.error('Role update failed:', error);
      toast({ 
        variant: 'destructive', 
        title: 'Update Failed', 
        description: error.code === 'auth/wrong-password' ? 'The password you entered is incorrect.' : 'An unexpected error occurred.'
      });
    } finally {
      setIsUpdating(false);
      setPassword('');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedRole}
        onValueChange={(newRole) => setSelectedRole(newRole as UserProfile['role'])}
        disabled={!canEditRole || isUpdating}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select a role" />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map(role => (
            <SelectItem key={role} value={role}>{role}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {roleChanged && (
        <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button size="icon" className="h-9 w-9">
              <Save className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2"><ShieldAlert className="text-destructive"/> Confirm Role Change</AlertDialogTitle>
              <AlertDialogDescription>
                To change {user.name}'s role to <strong>{selectedRole}</strong>, please enter your password.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPassword('')}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleReauthAndUpdate} disabled={isUpdating || !password}>
                {isUpdating ? <Loader2 className="animate-spin"/> : "Confirm & Save"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
