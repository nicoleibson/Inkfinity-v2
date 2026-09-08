// src/components/admin/user-status-control.tsx
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
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const STATUSES: UserProfile['status'][] = ['active', 'pending_verification', 'pending_payment', 'suspended'];

const statusConfig: Record<UserProfile['status'], { label: string; color: string; }> = {
  active: { label: 'Active', color: 'bg-green-500' },
  pending_verification: { label: 'Pending Verification', color: 'bg-amber-500' },
  pending_payment: { label: 'Pending Payment', color: 'bg-blue-500' },
  suspended: { label: 'Suspended', color: 'bg-red-500' },
};

interface UserStatusControlProps {
  user: UserProfile & { uid: string };
  currentUserRole: UserProfile['role'];
  onSuccess: () => void;
}

export function UserStatusControl({ user, currentUserRole, onSuccess }: UserStatusControlProps) {
  const [selectedStatus, setSelectedStatus] = useState(user.status);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();
  
  const isSelf = auth.currentUser?.uid === user.uid;

  // Define who can be edited
  const canBeEditedByAdmin = !['Administrator', 'Super-Administrator'].includes(user.role);
  const canBeEditedBySuperAdmin = user.role !== 'Super-Administrator';

  const canEditStatus = 
        !isSelf &&
        (
            (currentUserRole === 'Super-Administrator' && canBeEditedBySuperAdmin) ||
            (currentUserRole === 'Administrator' && canBeEditedByAdmin)
        );

  const statusChanged = user.status !== selectedStatus;
  
  const currentStatusConfig = statusConfig[selectedStatus] || { label: selectedStatus, color: 'bg-gray-500' };

  const handleReauthAndUpdate = async () => {
    const adminUser = auth.currentUser;
    if (!adminUser || !adminUser.email) {
      toast({ variant: 'destructive', title: 'Authentication Error' });
      return;
    }
    
    setIsUpdating(true);
    try {
      const credential = EmailAuthProvider.credential(adminUser.email, password);
      await reauthenticateWithCredential(adminUser, credential);
      
      const userRef = ref(database, `users/${user.uid}`);
      await update(userRef, { status: selectedStatus });
      toast({ title: 'Status Updated', description: `${user.name}'s status has been changed to ${selectedStatus}.` });
      
      setIsDialogOpen(false);
      onSuccess();
    } catch (error: any) {
      console.error('Status update failed:', error);
      toast({ variant: 'destructive', title: 'Update Failed', description: error.message || 'Incorrect password or update failed.' });
    } finally {
      setIsUpdating(false);
      setPassword('');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedStatus}
        onValueChange={(newStatus) => setSelectedStatus(newStatus as UserProfile['status'])}
        disabled={!canEditStatus || isUpdating}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue asChild>
              <Badge className={cn("text-white", currentStatusConfig.color)}>
                {currentStatusConfig.label}
              </Badge>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map(status => {
            const config = statusConfig[status];
            return (
              <SelectItem key={status} value={status}>
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", config.color)}></span>
                  <span>{config.label}</span>
                </div>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      
      {statusChanged && (
         <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button size="icon" className="h-9 w-9">
              <Save className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2"><ShieldAlert className="text-destructive"/> Confirm Status Change</AlertDialogTitle>
              <AlertDialogDescription>
                To change {user.name}'s status to <strong>{selectedStatus}</strong>, please enter your password.
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
