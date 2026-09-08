// src/app/admin/admin-panel.tsx
"use client";

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { Loader2, Save, Server, Wifi, WifiOff, ShieldAlert, Gem, RefreshCcw, Award } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ref, update, get } from 'firebase/database';
import { auth, database } from '@/lib/firebase-config';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
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
import { syncAllNfts } from '@/lib/nft-sync';
import type { UserProfile } from '@/types/user';
import { grantGlobalMembership } from '@/lib/actions/user-actions';

export default function AdminPanel() {
  const { settings, loading: loadingSettings, error } = usePlatformSettings();
  const [isSaving, setIsSaving] = useState(false);
  const [password, setPassword] = useState('');
  
  const [selectedNetwork, setSelectedNetwork] = useState('');
  const [artistFee, setArtistFee] = useState<number | string>('');
  const [studioFee, setStudioFee] = useState<number | string>('');
  const [supplyStoreFee, setSupplyStoreFee] = useState<number | string>('');

  const [isSyncing, setIsSyncing] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [loadingCurrentUser, setLoadingCurrentUser] = useState(true);
  const [isGranting, setIsGranting] = useState(false);
  const [isGrantMembershipDialogOpen, setIsGrantMembershipDialogOpen] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
        if (user) {
            const userRef = ref(database, `users/${user.uid}`);
            get(userRef).then(snapshot => {
                if (snapshot.exists()) {
                    setCurrentUserProfile({ uid: user.uid, ...snapshot.val() });
                }
                setLoadingCurrentUser(false);
            });
        } else {
            setLoadingCurrentUser(false);
        }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (settings) {
        setSelectedNetwork(settings.network || 'amoy');
        setArtistFee(settings.artistMembershipTiers?.tier1 ?? '');
        setStudioFee(settings.studioRegistrationFee ?? '');
        setSupplyStoreFee(settings.supplyStoreRegistrationFee ?? '');
    }
  }, [settings]);

  if (loadingSettings || loadingCurrentUser) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="text-destructive text-center p-8">{error}</div>;
  }

  const handleTriggerSave = () => {
    // Open password confirmation dialog
    setIsDialogOpen(true);
  }

  const handleReauthenticationAndSave = async () => {
    setIsSaving(true);
    const user = auth.currentUser;
    if (!user || !user.email) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'No authenticated user found.',
      });
      setIsSaving(false);
      return;
    }

    try {
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
        
        await handleSave();
        
    } catch (err: any) {
        console.error(err);
        toast({
            variant: 'destructive',
            title: 'Authentication Failed',
            description: 'The password you entered is incorrect. Please try again.',
        });
    } finally {
        setIsSaving(false);
        setPassword('');
        setIsDialogOpen(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    try {
      const settingsRef = ref(database, 'platform_settings');
      const updates = {
          network: selectedNetwork,
          artistMembershipTiers: {
              tier1: Number(artistFee) || 0,
              tier2: (Number(artistFee) || 0) * 2, // Example logic for other tiers
              tier3: (Number(artistFee) || 0) * 3,
          },
          studioRegistrationFee: Number(studioFee) || 0,
          supplyStoreRegistrationFee: Number(supplyStoreFee) || 0,
          theme: settings.theme // Save the updated theme settings
      };
      await update(settingsRef, updates);
      toast({
        title: 'Settings Saved',
        description: `Platform settings have been successfully updated.`,
      });
    } catch (err: any) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: err.message || 'Could not save platform settings.',
      });
    }
  };

  const handleSyncNfts = async () => {
    setIsSyncing(true);
    toast({ title: "Starting NFT Sync", description: "This may take a few moments..." });
    try {
        const { synced, mismatched } = await syncAllNfts();
        toast({ title: "Sync Complete", description: `Checked ${synced} NFTs. Found ${mismatched} ownership mismatches.` });
    } catch (error: any) {
        console.error(error);
        toast({ variant: "destructive", title: "Sync Failed", description: error.message });
    } finally {
        setIsSyncing(false);
    }
  }

  const handleGrantMembership = () => {
    setIsGrantMembershipDialogOpen(true);
  };

  const handleReauthAndGrantMembership = async () => {
    const user = auth.currentUser;
    if (!user || !user.email) {
      toast({ variant: 'destructive', title: 'Authentication Error' });
      return;
    }
    
    setIsGranting(true);
    
    try {
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
        
        const result = await grantGlobalMembership();

        if (result.success) {
            toast({
                title: 'Global Membership Granted!',
                description: `Successfully updated ${result.updatedCount} users with a 1-year membership.`
            });
        } else {
            throw new Error(result.error || 'The server action failed.');
        }

    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Action Failed',
            description: error.message || 'Could not grant membership.'
        });
    } finally {
        setIsGranting(false);
        setPassword('');
        setIsGrantMembershipDialogOpen(false);
    }
  }


  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Platform Configuration</CardTitle>
          <CardDescription>
            Manage global settings for the entire platform. These changes are
            high-impact and require password confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
              <div>
                <h3 className="text-md font-medium flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Blockchain Network
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Set the global blockchain network for all transactions and
                  interactions.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-4 sm:mt-0">
                {selectedNetwork === 'polygon' ? (
                  <div className="flex items-center gap-2 text-green-500 font-semibold">
                    <Wifi className="h-5 w-5" />
                    <span>Polygon Mainnet</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-500 font-semibold">
                    <WifiOff className="h-5 w-5" />
                    <span>Amoy Testnet</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 border-t pt-4 flex flex-col sm:flex-row items-center gap-4">
              <div className="w-full sm:w-64">
                <Select
                  value={selectedNetwork}
                  onValueChange={setSelectedNetwork}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select network..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amoy">Amoy Testnet</SelectItem>
                    <SelectItem value="polygon">Polygon Mainnet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
             <p className="text-xs text-muted-foreground mt-3">
              <span className="font-bold text-destructive">Warning:</span>{' '}
              Changing the network will affect all live and future
              transactions.
            </p>
          </Card>

          <Card className="p-4">
              <h3 className="text-md font-medium flex items-center gap-2 mb-4">
                  <Gem className="h-5 w-5" />
                  Membership & Registration Fees (ETH)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="artistFee">Artist Yearly Membership</Label>
                        <Input id="artistFee" type="number" placeholder="e.g., 0.05" value={artistFee} onChange={(e) => setArtistFee(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="studioFee">Studio Registration Fee</Label>
                        <Input id="studioFee" type="number" placeholder="e.g., 0.1" value={studioFee} onChange={(e) => setStudioFee(e.target.value)} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="supplyStoreFee">Supply Store Registration</Label>
                        <Input id="supplyStoreFee" type="number" placeholder="e.g., 0.1" value={supplyStoreFee} onChange={(e) => setSupplyStoreFee(e.target.value)} />
                    </div>
              </div>
          </Card>
           <Card className="p-4">
            <h3 className="text-md font-medium flex items-center gap-2 mb-2">
                <RefreshCcw className="h-5 w-5" />
                Data Synchronization
            </h3>
            <div className="flex flex-col sm:flex-row items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    Manually sync NFT ownership status across the platform.
                </p>
                 <Button onClick={handleSyncNfts} disabled={isSyncing} variant="outline">
                    {isSyncing ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
                     {isSyncing ? 'Syncing...' : 'Sync NFT Ownership'}
                </Button>
            </div>
          </Card>
           {currentUserProfile?.role === 'Super-Administrator' && (
             <Card className="p-4">
                <h3 className="text-md font-medium flex items-center gap-2 mb-2">
                    <Award className="h-5 w-5" />
                    Promotional Actions
                </h3>
                <div className="flex flex-col sm:flex-row items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Grant a 1-year membership to all paying user roles (Artists, Studios, Stores).
                    </p>
                    <Button onClick={handleGrantMembership} disabled={isGranting} variant="outline">
                        {isGranting ? <Loader2 className="animate-spin" /> : <Award />}
                        {isGranting ? 'Granting...' : 'Grant Global Membership'}
                    </Button>
                </div>
            </Card>
           )}
        </CardContent>
        <CardFooter>
            <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <AlertDialogTrigger asChild>
                    <Button onClick={handleTriggerSave} disabled={isSaving}>
                        <Save className="mr-2 h-4 w-4" />
                        Save All Settings
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      <ShieldAlert className="inline-block mr-2 text-destructive"/>
                      Confirm Changes
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This is a sensitive action. For your security, please
                      enter your password to confirm you want to save these changes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input 
                        id="password" 
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password..."
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setPassword('')}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReauthenticationAndSave} disabled={isSaving || !password}>
                      {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                      Confirm & Save
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
        </CardFooter>
      </Card>
      
      <AlertDialog open={isGrantMembershipDialogOpen} onOpenChange={setIsGrantMembershipDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>
                    <ShieldAlert className="inline-block mr-2 text-destructive"/>
                    Confirm Global Membership Grant
                </AlertDialogTitle>
                <AlertDialogDescription>
                    This action will add or extend the membership of all Artists, Studios, and Supply Stores by one year, marking them as active. This is irreversible. Please enter your password to confirm.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
                <Label htmlFor="grant-password">Password</Label>
                <Input 
                    id="grant-password" 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password..."
                />
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setPassword('')}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReauthAndGrantMembership} disabled={isGranting || !password}>
                    {isGranting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Confirm & Grant
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
