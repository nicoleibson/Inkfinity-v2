// src/components/admin/referral-edit-dialog.tsx
"use client";

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { auth, database, EmailAuthProvider } from '@/lib/firebase-config';
import { reauthenticateWithCredential } from 'firebase/auth';
import { ref, update } from 'firebase/database';
import { Loader2, Percent, Save, ShieldAlert } from 'lucide-react';
import type { Referral } from '@/types/referral';

interface ReferralEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referral: Referral | null;
  onSuccess: () => void;
}

export function ReferralEditDialog({ open, onOpenChange, referral, onSuccess }: ReferralEditDialogProps) {
  const [discount, setDiscount] = useState(0);
  const [commission, setCommission] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isReauthOpen, setIsReauthOpen] = useState(false);
  const [password, setPassword] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (referral) {
      setDiscount(referral.discountPercentage);
      setCommission(referral.commissionPercentage);
    }
  }, [referral]);
  
  const handleTriggerSave = () => {
    if (!referral) return;
    if (discount < 0 || discount > 100 || commission < 0 || commission > 100) {
        toast({ variant: 'destructive', title: 'Invalid Percentage', description: 'Percentages must be between 0 and 100.' });
        return;
    }
    setIsReauthOpen(true);
  }

  const handleReauthAndSave = async () => {
    const adminUser = auth.currentUser;
    if (!adminUser || !adminUser.email || !referral) {
        toast({variant: 'destructive', title: 'Authentication Error'});
        return;
    }
    setLoading(true);

    try {
        const credential = EmailAuthProvider.credential(adminUser.email, password);
        await reauthenticateWithCredential(adminUser, credential);

        const referralRef = ref(database, `referrals/${referral.code}`);
        await update(referralRef, {
            discountPercentage: Number(discount),
            commissionPercentage: Number(commission)
        });

        toast({ title: 'Referral Updated', description: `Percentages for code ${referral.code} have been saved.` });
        
        setIsReauthOpen(false);
        onOpenChange(false);
        onSuccess();
    } catch (error) {
        console.error("Referral update failed:", error);
        toast({variant: 'destructive', title: 'Update Failed', description: 'Incorrect password or an error occurred.'});
    } finally {
        setLoading(false);
        setPassword('');
    }
  }

  if (!referral) return null;

  return (
     <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <AlertDialog open={isReauthOpen} onOpenChange={setIsReauthOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2"><ShieldAlert className="text-destructive"/> Confirm Action</AlertDialogTitle>
                    <AlertDialogDescription>
                       To modify these referral percentages, please confirm your password.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                 <div className="space-y-2">
                    <Label htmlFor="password-confirm">Password</Label>
                    <Input id="password-confirm" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setPassword('')}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReauthAndSave} disabled={loading || !password}>
                        {loading ? <Loader2 className="animate-spin"/> : "Confirm & Save"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <DialogHeader>
          <DialogTitle className="font-headline">Edit Referral: {referral.code}</DialogTitle>
          <DialogDescription>
            Adjust the discount for new users and the commission for the referring admin.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="discount">User Discount Percentage</Label>
            <div className="relative">
                <Input id="discount" type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="pl-8"/>
                <Percent className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/>
            </div>
            <p className="text-xs text-muted-foreground">The discount the new user gets when using this code.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="commission">Admin Commission Percentage</Label>
             <div className="relative">
                <Input id="commission" type="number" value={commission} onChange={(e) => setCommission(Number(e.target.value))} className="pl-8"/>
                <Percent className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/>
            </div>
            <p className="text-xs text-muted-foreground">The commission the referring admin earns from the payment.</p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleTriggerSave} disabled={loading}>
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
