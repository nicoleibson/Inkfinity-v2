
// src/app/settings/page.tsx
"use client";

import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { User, Shield, Lock, Loader2, Upload, WalletCards, Unlink, Crown, MapPin, Instagram, Twitter, Link as LinkIcon, BookUser, AlertCircle, CalendarDays, MessageCircle, Send, CheckCircle2, HardDrive, ExternalLink, Cloud } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { geocodeAddress } from '@/ai/flows/geocode-address-flow';
import { auth, database } from '@/lib/firebase-config';
import { onAuthStateChanged, User as FirebaseUser, updateProfile as updateAuthProfile, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import type { UserProfile } from '@/types/user';
import { hasActiveMembership } from '@/lib/utils/membership';
import { get, ref, update, onValue } from 'firebase/database';
import WorldIdVerification from './world-id-verification';
import Image from 'next/image';
import { useWallet } from '@/context/wallet-provider';
import { SessionManagement } from './session-management';
import { useRouter } from 'next/navigation';
import { Calendar } from '@/components/ui/calendar';
import { format as formatDate, parseISO } from 'date-fns';
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
import {
  uploadProfileImageToGoogleDrive,
  authorizeGoogleDrive,
  getCachedDriveAccessToken,
  clearDriveAccessToken,
  getDriveFolderUrl,
  deleteOldUserMedia,
} from '@/lib/google-drive';

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = React.useState<FirebaseUser | null>(null);
  const [profile, setProfile] = React.useState<Partial<UserProfile>>({});
  const [originalUsername, setOriginalUsername] = React.useState('');
  const [loadingProfile, setLoadingProfile] = React.useState(true);
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [savingSecurity, setSavingSecurity] = React.useState(false);
  const [savingPrivacy, setSavingPrivacy] = React.useState(false);
  const [savingBooking, setSavingBooking] = React.useState(false);
  const [isUpgrading, setIsUpgrading] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState('');
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [isReauthDialogOpen, setIsReauthDialogOpen] = React.useState(false);
  const [unavailableDates, setUnavailableDates] = React.useState<Date[]>([]);
  const router = useRouter();

  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [backgroundFile, setBackgroundFile] = React.useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [backgroundPreview, setBackgroundPreview] = React.useState<string | null>(null);
  const [isConnectingDrive, setIsConnectingDrive] = React.useState(false);
  const [driveConnected, setDriveConnected] = React.useState<boolean>(false);
  
  const [isFetchingLocation, setIsFetchingLocation] = React.useState(false);


  const { toast } = useToast();
  const { walletAddress, disconnectWallet, isConnected, connectWallet } = useWallet();

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const email = currentUser?.email || profile.email;
      if (email) {
        const token = getCachedDriveAccessToken(email);
        setDriveConnected(Boolean(token));
      } else {
        setDriveConnected(false);
      }
    }
  }, [currentUser?.email, profile.email]);

  const handleConnectDrive = async () => {
    const userEmail = currentUser?.email || profile.email;
    if (!userEmail) {
      toast({
        variant: "destructive",
        title: "Correo no disponible",
        description: "No se encontró el correo electrónico registrado de tu cuenta de Inkfinity.",
      });
      return;
    }
    setIsConnectingDrive(true);
    try {
      const token = await authorizeGoogleDrive(userEmail);
      if (token) {
        setDriveConnected(true);
        toast({
          title: "Google Drive Vinculado",
          description: `Tu cuenta (${userEmail}) ha sido vinculada correctamente. Tus fotos de perfil y obras se guardarán en tu propia carpeta 'Inkfinity Artworks'.`,
        });
      }
    } catch (err: any) {
      console.error("Error vinculando Google Drive:", err);
      toast({
        variant: "destructive",
        title: "Error al vincular Google Drive",
        description: err?.message || "No se pudo autorizar Google Drive.",
      });
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const handleDisconnectDrive = () => {
    const userEmail = currentUser?.email || profile.email;
    clearDriveAccessToken(userEmail);
    setDriveConnected(false);
    toast({
      title: "Google Drive Desvinculado",
      description: "Se ha cerrado la sesión de Google Drive en este dispositivo.",
    });
  };

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        const userRef = ref(database, `users/${user.uid}`);
        
        const unsubscribeDb = onValue(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const userData = snapshot.val();
            setProfile({ uid: user.uid, ...userData });
            setOriginalUsername(userData.username);
            if (userData.avatarUrl) setAvatarPreview(userData.avatarUrl);
            if (userData.backgroundUrl) setBackgroundPreview(userData.backgroundUrl);
             if (userData.availability) {
                const dates = Object.keys(userData.availability).map(dateStr => parseISO(dateStr));
                setUnavailableDates(dates);
            } else {
                setUnavailableDates([]);
            }
          }
          setLoadingProfile(false);
        });

        return () => unsubscribeDb();
      } else {
        setLoadingProfile(false);
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
     const { name, value } = e.target;
    setProfile(prev => ({...prev, [name]: value}));
  }

  const handleGetCurrentLocation = () => {
    setIsFetchingLocation(true);
    if (!navigator.geolocation) {
        toast({
            variant: "destructive",
            title: "Geolocation Not Supported",
            description: "Your browser does not support geolocation.",
        });
        setIsFetchingLocation(false);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            try {
                // Reverse geocode to get a display name
                const result = await geocodeAddress({ lat: latitude, lng: longitude });
                setProfile(prev => ({
                    ...prev,
                    locationName: result.address,
                    location: { lat: latitude, lng: longitude }
                }));
                toast({ title: "Location Updated", description: `Location set to ${result.address}. Click "Save Changes" to confirm.` });
            } catch (error) {
                console.error("Reverse geocoding failed:", error);
                toast({ variant: "destructive", title: "Could not get address", description: "Failed to determine address from your location." });
            } finally {
                setIsFetchingLocation(false);
            }
        },
        (error) => {
            console.error("Geolocation error:", error);
            let description = "An unknown error occurred.";
            if (error.code === error.PERMISSION_DENIED) {
                description = "Please allow location access in your browser settings.";
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                description = "Your location information is currently unavailable.";
            }
            toast({
                variant: "destructive",
                title: "Geolocation Failed",
                description: description,
            });
            setIsFetchingLocation(false);
        }
    );
  };

  const handleLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({
        ...prev,
        links: {
            ...prev.links,
            [name]: value
        }
    }));
  };
  
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'background') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const previewUrl = reader.result as string;
        if (type === 'avatar') {
          setAvatarFile(file);
          setAvatarPreview(previewUrl);
        } else {
          setBackgroundFile(file);
          setBackgroundPreview(previewUrl);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfileUpdate = async () => {
    if (!currentUser || !profile.username) return;
    setSavingProfile(true);

    const updates: { [key: string]: any } = {};
    const userInputUsername = profile.username.toLowerCase();
    const newUsername = userInputUsername.replace(/[^a-z0-9]/g, '');

    if(userInputUsername !== newUsername) {
        toast({
            title: 'Username Adjusted',
            description: `Your username has been set to "${newUsername}" to remove invalid characters.`,
        });
        setProfile(prev => ({...prev, username: newUsername}));
    }

    try {
      if (newUsername !== originalUsername) {
        const newUsernameRef = ref(database, `usernames/${newUsername}`);
        const snapshot = await get(newUsernameRef);
        if (snapshot.exists()) {
          toast({ variant: "destructive", title: "Username Taken", description: "This username is already in use." });
          setProfile(prev => ({...prev, username: originalUsername})); // Revert username in UI
          setSavingProfile(false);
          return;
        }
        updates[`/usernames/${originalUsername}`] = null;
        updates[`/usernames/${newUsername}`] = currentUser.uid;
        updates[`/users/${currentUser.uid}/username`] = newUsername;
      }
      
      updates[`/users/${currentUser.uid}/name`] = profile.name || null;
      updates[`/users/${currentUser.uid}/bio`] = profile.bio || null;
      updates[`/users/${currentUser.uid}/links`] = profile.links || null;
      updates[`/users/${currentUser.uid}/location`] = profile.location || null;
      updates[`/users/${currentUser.uid}/locationName`] = profile.locationName || null;

      const userEmail = currentUser.email || profile.email;
      let driveToken = userEmail ? getCachedDriveAccessToken(userEmail) : null;
      const existingFolderId = profile.googleDriveFolderId || undefined;

      if (avatarFile && avatarPreview) {
        const oldAvatarUrl = profile.avatarUrl;
        const oldAvatarDriveFileId = profile.avatarDriveFileId;
        let avatarUrl = '';
        let driveSuccess = false;
        let newAvatarDriveFileId: string | null = null;

        // Prefer Google Drive upload to the user's unified Inkfinity folder
        try {
          if (!driveToken && userEmail) {
            driveToken = await authorizeGoogleDrive(userEmail);
            setDriveConnected(true);
          }
          if (driveToken) {
            const driveRes = await uploadProfileImageToGoogleDrive(
              driveToken,
              currentUser.uid,
              'avatar',
              avatarPreview,
              existingFolderId
            );
            avatarUrl = driveRes.imageUrl;
            newAvatarDriveFileId = driveRes.fileId;
            updates[`/users/${currentUser.uid}/googleDriveFolderId`] = driveRes.folderId;
            updates[`/users/${currentUser.uid}/avatarDriveFileId`] = driveRes.fileId;
            updates[`/users/${currentUser.uid}/avatarUrl`] = avatarUrl;
            driveSuccess = true;
          }
        } catch (driveErr: any) {
          console.warn("Google Drive upload for avatar failed/cancelled, falling back to storage:", driveErr);
          if (driveErr?.message?.includes('no coincide')) {
            toast({
              variant: "destructive",
              title: "Cuenta de Google no válida",
              description: driveErr.message,
            });
          }
        }

        if (!driveSuccess) {
          throw new Error("Se requiere vinculación con Google Drive para subir imágenes.");
        }

        // Delete old avatar image from storage (Google Drive and/or local storage)
        await deleteOldUserMedia({
          oldUrl: oldAvatarUrl,
          oldDriveFileId: oldAvatarDriveFileId,
          accessToken: driveToken,
        });

        setProfile((prev) => ({
          ...prev,
          avatarUrl,
          avatarDriveFileId: newAvatarDriveFileId,
          ...(driveSuccess && updates[`/users/${currentUser.uid}/googleDriveFolderId`]
            ? { googleDriveFolderId: updates[`/users/${currentUser.uid}/googleDriveFolderId`] }
            : {}),
        }));

        await updateAuthProfile(currentUser, { photoURL: avatarUrl });
      }

      if (backgroundFile && backgroundPreview) {
        const oldBackgroundUrl = profile.backgroundUrl;
        const oldBackgroundDriveFileId = profile.backgroundDriveFileId;
        let backgroundUrl = '';
        let driveSuccess = false;
        let newBackgroundDriveFileId: string | null = null;

        // Prefer Google Drive upload to the user's unified Inkfinity folder
        try {
          if (!driveToken && userEmail) {
            driveToken = await authorizeGoogleDrive(userEmail);
            setDriveConnected(true);
          }
          if (driveToken) {
            const targetFolderId = (updates[`/users/${currentUser.uid}/googleDriveFolderId`] as string) || existingFolderId;
            const driveRes = await uploadProfileImageToGoogleDrive(
              driveToken,
              currentUser.uid,
              'background',
              backgroundPreview,
              targetFolderId
            );
            backgroundUrl = driveRes.imageUrl;
            newBackgroundDriveFileId = driveRes.fileId;
            updates[`/users/${currentUser.uid}/googleDriveFolderId`] = driveRes.folderId;
            updates[`/users/${currentUser.uid}/backgroundDriveFileId`] = driveRes.fileId;
            updates[`/users/${currentUser.uid}/backgroundUrl`] = backgroundUrl;
            driveSuccess = true;
          }
        } catch (driveErr: any) {
          console.warn("Google Drive upload for background failed/cancelled, falling back to storage:", driveErr);
          if (driveErr?.message?.includes('no coincide')) {
            toast({
              variant: "destructive",
              title: "Cuenta de Google no válida",
              description: driveErr.message,
            });
          }
        }

        if (!driveSuccess) {
          throw new Error("Se requiere vinculación con Google Drive para subir imágenes.");
        }

        // Delete old background image from storage (Google Drive and/or local storage)
        await deleteOldUserMedia({
          oldUrl: oldBackgroundUrl,
          oldDriveFileId: oldBackgroundDriveFileId,
          accessToken: driveToken,
        });

        setProfile((prev) => ({
          ...prev,
          backgroundUrl,
          backgroundDriveFileId: newBackgroundDriveFileId,
          ...(driveSuccess && updates[`/users/${currentUser.uid}/googleDriveFolderId`]
            ? { googleDriveFolderId: updates[`/users/${currentUser.uid}/googleDriveFolderId`] }
            : {}),
        }));
      }

      await update(ref(database), updates);
      
      if (profile.name) {
          await updateAuthProfile(currentUser, { displayName: profile.name });
      }
      
      if (newUsername !== originalUsername) {
        setOriginalUsername(newUsername);
      }

      toast({
        title: "Profile Updated",
        description: "Your profile information has been saved.",
      });
      setAvatarFile(null);
      setBackgroundFile(null);
    } catch (error) {
      console.error("Profile update error:", error);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Could not save your profile changes.",
      });
    } finally {
      setSavingProfile(false);
    }
  }

  const handlePrivacyChange = async (isPrivate: boolean) => {
    if (!currentUser) return;
    setSavingPrivacy(true);
    setProfile(prev => ({ ...prev, isPrivate }));
    try {
        const userRef = ref(database, `users/${currentUser.uid}`);
        await update(userRef, { isPrivate });
        toast({
            title: "Privacy Settings Updated",
            description: `Your profile is now ${isPrivate ? 'private' : 'public'}.`,
        });
    } catch (error) {
        console.error("Privacy update error:", error);
        toast({
            variant: "destructive",
            title: "Update Failed",
            description: "Could not save your privacy settings.",
        });
        setProfile(prev => ({ ...prev, isPrivate: !isPrivate }));
    } finally {
        setSavingPrivacy(false);
    }
  }

   const handleBookingSettingsChange = async () => {
    if (!currentUser) return;
    setSavingBooking(true);
    
    // Convert array of Date objects to the desired database format
    const availabilityData = unavailableDates.reduce((acc, date) => {
        acc[formatDate(date, 'yyyy-MM-dd')] = true;
        return acc;
    }, {} as { [key: string]: boolean });

    try {
        const userRef = ref(database, `users/${currentUser.uid}`);
        await update(userRef, { 
            allowsArtistBookings: profile.allowsArtistBookings,
            bookingDeposit: Number(profile.bookingDeposit) || 0,
            availability: availabilityData
        });
        toast({
            title: "Booking Settings Updated",
            description: "Your booking settings have been saved.",
        });
    } catch (error) {
        console.error("Booking settings update error:", error);
        toast({
            variant: "destructive",
            title: "Update Failed",
            description: "Could not save your booking settings.",
        });
    } finally {
        setSavingBooking(false);
    }
  }
  
  const handleSecurityUpdate = () => {
    if (!newPassword.trim()) {
      toast({ variant: 'destructive', title: 'No New Password', description: 'Please enter a new password to update.' });
      return;
    }
    setIsReauthDialogOpen(true);
  };
  
  const handleReauthenticateAndUpdatePassword = async () => {
    if (!currentUser || !currentUser.email || !newPassword || !currentPassword) return;
    setSavingSecurity(true);
    
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      
      await updatePassword(currentUser, newPassword);
      
      toast({ title: 'Password Updated', description: 'Your password has been changed successfully.' });
      setNewPassword('');
      setCurrentPassword('');
      setIsReauthDialogOpen(false);
    } catch (error: any) {
      console.error("Password update error:", error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: error.code === 'auth/wrong-password' ? 'The current password you entered is incorrect.' : 'Failed to update password.',
      });
    } finally {
      setSavingSecurity(false);
    }
  };




  const handleUpgradeToArtist = async () => {
    if (!currentUser) return;
    setIsUpgrading(true);
    const userRef = ref(database, `users/${currentUser.uid}`);
    try {
        const updates: Partial<UserProfile> = {
            artistRequestStatus: 'pending',
        };
        await update(userRef, updates);
        setProfile(prev => ({...prev, ...updates}));
        toast({
            title: 'Request Sent!',
            description: 'Your request to become an artist has been sent for approval.'
        });
    } catch (error) {
        console.error('Upgrade to artist error:', error);
        toast({ variant: 'destructive', title: 'Request Failed', description: 'Could not send your upgrade request.' });
    } finally {
        setIsUpgrading(false);
    }
  }

  const handleDisconnectWallet = async () => {
    if (!currentUser) return;
    await disconnectWallet();
    setProfile(prev => ({...prev, walletAddress: undefined}));
  }

  const isClient = profile.role === 'Client';
  const isArtist = profile.role === 'Tattoo Artist' || profile.role === 'Studio';
  
  const getUpgradeButton = () => {
    if (!isClient) return null;

    switch (profile.artistRequestStatus) {
        case 'pending':
            return <Button disabled>Pending Approval</Button>;
        case 'approved':
            return <Button disabled>Approved</Button>; // Should not happen if role is client
        case 'rejected':
            return (
                <div className="flex items-center gap-4">
                    <p className="text-sm text-destructive">Your previous request was not approved.</p>
                    <Button onClick={handleUpgradeToArtist} disabled={isUpgrading}>
                        {isUpgrading && <Loader2 className="animate-spin"/>}
                        {isUpgrading ? 'Sending...' : 'Re-apply to be an Artist'}
                    </Button>
                </div>
            );
        case 'none':
        default:
            return (
                <Button onClick={handleUpgradeToArtist} disabled={isUpgrading}>
                    {isUpgrading && <Loader2 className="animate-spin"/>}
                    {isUpgrading ? 'Sending...' : 'Start Free Trial'}
                </Button>
            );
    }
  }

  const getMembershipContent = () => {
     if (loadingProfile) {
        return <Loader2 className="h-8 w-8 animate-spin" />;
    }
    
    if (profile.role === 'Studio' || profile.role === 'Supply Store') {
        if (profile.status === 'pending_payment') {
            return (
                 <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4"/>
                    <AlertTitle>Action Required</AlertTitle>
                    <AlertDescription className="flex items-center justify-between">
                        <span>Your account requires a one-time registration fee to be activated.</span>
                        <Button onClick={() => router.push('/payment')}>Complete Payment</Button>
                    </AlertDescription>
                </Alert>
            );
        }
        return <p>Your {profile.role} account is active.</p>;
    }

    if (profile.role === 'Tattoo Artist') {
        if (profile.status === 'pending_payment') {
             return (
                 <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4"/>
                    <AlertTitle>Membership Expired</AlertTitle>
                    <AlertDescription className="flex items-center justify-between">
                        <span>Your artist trial or membership has expired. Please renew to continue.</span>
                        <Button onClick={() => router.push('/payment')}>Renew Now</Button>
                    </AlertDescription>
                </Alert>
            );
        }
        if (profile.trialEndsAt) {
            const trialEndDate = new Date(profile.trialEndsAt);
            if (trialEndDate > new Date()) {
                 return <p>You are an Artist. Your free trial ends on {trialEndDate.toLocaleDateString()}.</p>;
            }
        }
        return <p>You have an active Artist Membership.</p>;
    }
    
    if (profile.role === 'Client') {
        return (
            <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                    <h3 className="font-medium">Upgrade to Artist Account</h3>
                    <p className="text-sm text-muted-foreground">
                        Start your 3-month free trial to begin uploading and selling artwork.
                    </p>
                </div>
                {getUpgradeButton()}
            </div>
        )
    }

    return <p>Your account type is: {profile.role}</p>;
  }


  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <User className="h-8 w-8 text-primary" />
        <h1 className="text-4xl font-headline font-bold">Settings</h1>
      </div>
       <AlertDialog open={isReauthDialogOpen} onOpenChange={setIsReauthDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Re-authenticate to Continue</AlertDialogTitle>
                <AlertDialogDescription>
                For your security, please confirm your current password before making this change.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input 
                    id="current-password" 
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter your current password..."
                />
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setCurrentPassword('')}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReauthenticateAndUpdatePassword} disabled={savingSecurity || !currentPassword}>
                    {savingSecurity && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Confirm & Update Password
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
       </AlertDialog>
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-5 max-w-2xl">
          <TabsTrigger value="profile"><User className="mr-2 h-4 w-4" />Profile</TabsTrigger>
          {isArtist && <TabsTrigger value="bookings"><BookUser className="mr-2 h-4 w-4"/>Bookings</TabsTrigger>}
          <TabsTrigger value="security"><Lock className="mr-2 h-4 w-4" />Security</TabsTrigger>
          <TabsTrigger value="privacy"><Shield className="mr-2 h-4 w-4" />Privacy</TabsTrigger>
          <TabsTrigger value="membership"><Crown className="mr-2 h-4 w-4" />Membership</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline">Public Profile</CardTitle>
              <CardDescription>This information will be displayed on your public profile.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingProfile ? (
                 <div className="flex justify-center items-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <div className="space-y-6">
                    {/* Google Drive Storage Status Card */}
                    <div className="p-4 rounded-xl border border-border bg-card/60 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                            <HardDrive className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-sm">Almacenamiento en Google Drive</h4>
                              {profile.googleDriveFolderId || driveConnected ? (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-medium border border-emerald-500/20">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Vinculado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                                  No vinculado
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Tus fotos de perfil, imágenes de portada y obras se almacenan en tu propia cuenta personal de Google Drive.
                              {currentUser?.email && (
                                <span className="block mt-1 text-[11px] text-muted-foreground/80">
                                  Correo verificado de tu cuenta: <span className="font-mono text-foreground font-medium">{currentUser.email}</span>
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {profile.googleDriveFolderId && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-xs gap-1.5"
                              asChild
                            >
                              <a
                                href={getDriveFolderUrl(profile.googleDriveFolderId)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Ver carpeta
                              </a>
                            </Button>
                          )}
                          {driveConnected && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={handleDisconnectDrive}
                            >
                              Desvincular
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant={profile.googleDriveFolderId || driveConnected ? "outline" : "default"}
                            size="sm"
                            className="text-xs gap-1.5"
                            onClick={handleConnectDrive}
                            disabled={isConnectingDrive}
                          >
                            {isConnectingDrive ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Conectando...
                              </>
                            ) : (
                              <>
                                <Cloud className="h-3.5 w-3.5" />
                                {profile.googleDriveFolderId || driveConnected ? 'Reconectar Drive' : 'Vincular Google Drive'}
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-6 items-start">
                        <div className="space-y-2">
                          <Label>Profile Picture</Label>
                          <div className="relative w-32 h-32">
                             <Image 
                               src={avatarPreview || 'https://placehold.co/200x200.png'} 
                               alt="Avatar"
                               width={128}
                               height={128}
                               className="rounded-full object-cover w-32 h-32 border-2 border-primary bg-muted"
                               unoptimized
                             />
                             <Label htmlFor="avatarFile" className="absolute bottom-0 right-0 bg-secondary text-secondary-foreground p-2 rounded-full cursor-pointer hover:bg-primary">
                                <Upload className="h-4 w-4" />
                             </Label>
                             <Input id="avatarFile" type="file" accept="image/*" className="hidden" onChange={(e) => handleImageChange(e, 'avatar')} />
                          </div>
                        </div>
                        <div className="space-y-2 flex-grow">
                          <Label>Background Image</Label>
                           <div className="relative w-full aspect-video bg-muted rounded-md">
                             <Image 
                               src={backgroundPreview || 'https://placehold.co/600x400.png'} 
                               alt="Background"
                               fill
                               className="rounded-md object-cover border-2 border-muted"
                               unoptimized
                             />
                             <Label htmlFor="backgroundFile" className="absolute bottom-2 right-2 bg-secondary text-secondary-foreground p-2 rounded-full cursor-pointer hover:bg-primary">
                                <Upload className="h-4 w-4" />
                             </Label>
                             <Input id="backgroundFile" type="file" accept="image/*" className="hidden" onChange={(e) => handleImageChange(e, 'background')} />
                          </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Name</Label>
                            <Input id="name" name="name" value={profile.name || ''} onChange={handleProfileChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <Input id="username" name="username" value={profile.username || ''} onChange={handleProfileChange} />
                        </div>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="locationName">Location</Label>
                        <div className="flex items-center gap-2">
                            <Input 
                                id="locationName" 
                                name="locationName" 
                                value={profile.locationName || 'No location set'} 
                                readOnly
                                placeholder="Use the button to set your location"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleGetCurrentLocation}
                                disabled={isFetchingLocation}
                            >
                                {isFetchingLocation ? <Loader2 className="animate-spin" /> : <MapPin />}
                                <span className="ml-2 hidden sm:inline">Use My Location</span>
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">Click the button to use your device's current location. You must grant permission when prompted.</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="bio">Bio</Label>
                        <Textarea id="bio" name="bio" value={profile.bio || ''} onChange={handleProfileChange} />
                    </div>
                    <div className="space-y-4">
                        <Label>Links</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="relative">
                               <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                               <Input name="instagram" value={profile.links?.instagram || ''} onChange={handleLinkChange} placeholder="Instagram URL" className="pl-9"/>
                            </div>
                            <div className="relative">
                               <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                               <Input name="whatsapp" value={profile.links?.whatsapp || ''} onChange={handleLinkChange} placeholder="WhatsApp URL / Number" className="pl-9"/>
                            </div>
                            <div className="relative">
                               <Send className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                               <Input name="telegram" value={profile.links?.telegram || ''} onChange={handleLinkChange} placeholder="Telegram URL" className="pl-9"/>
                            </div>
                            <div className="relative">
                               <Twitter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                               <Input name="twitter" value={profile.links?.twitter || ''} onChange={handleLinkChange} placeholder="X / Twitter URL" className="pl-9"/>
                            </div>
                             <div className="relative md:col-span-2">
                               <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                               <Input name="portfolio" value={profile.links?.portfolio || ''} onChange={handleLinkChange} placeholder="Portfolio/Website URL" className="pl-9"/>
                            </div>
                        </div>
                    </div>
                    <Button onClick={handleProfileUpdate} disabled={loadingProfile || savingProfile}>
                        {savingProfile ? <Loader2 className="animate-spin" /> : "Save Changes"}
                    </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {isArtist && (
            <TabsContent value="bookings" className="mt-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline">Booking Settings</CardTitle>
                        <CardDescription>Manage how clients can book sessions with you.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div>
                            <h3 className="font-medium">Accept Bookings</h3>
                            <p className="text-sm text-muted-foreground">
                                Allow clients to request booking appointments with you.
                            </p>
                            </div>
                            <Switch
                                checked={profile.allowsArtistBookings}
                                onCheckedChange={(checked) => setProfile(prev => ({...prev, allowsArtistBookings: checked}))}
                                disabled={savingBooking}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bookingDeposit">Booking Deposit (USD)</Label>
                            <Input id="bookingDeposit" name="bookingDeposit" type="number" value={profile.bookingDeposit || ''} onChange={handleProfileChange} disabled={!profile.allowsArtistBookings || savingBooking} />
                            <p className="text-xs text-muted-foreground">Set to 0 to not require a deposit. This will be converted to ETH for payment.</p>
                        </div>
                         <Card className="p-4">
                            <h3 className="font-medium mb-2 flex items-center gap-2"><CalendarDays/>Set Unavailable Dates</h3>
                            <p className="text-sm text-muted-foreground mb-4">
                                Select dates on the calendar when you are not available for bookings. These dates will be blocked for clients.
                            </p>
                            <div className="flex justify-center">
                                <Calendar
                                    mode="multiple"
                                    selected={unavailableDates}
                                    onSelect={(dates: any) => setUnavailableDates(dates || [])}
                                    className="rounded-md border"
                                    disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() - 1))}
                                />
                            </div>
                        </Card>
                        <Button onClick={handleBookingSettingsChange} disabled={savingBooking}>
                            {savingBooking ? <Loader2 className="animate-spin" /> : "Save Booking Settings"}
                        </Button>
                    </CardContent>
                </Card>
            </TabsContent>
        )}
        <TabsContent value="security" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline">Login &amp; Password</CardTitle>
              <CardDescription>Manage your account security settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Card className="p-4">
                  <div className="flex flex-col sm:flex-row items-start justify-between">
                    <div>
                      <h3 className="text-md font-medium flex items-center gap-2">
                        <WalletCards className="h-5 w-5" />
                        Wallet Management
                      </h3>
                      {profile.walletAddress ? (
                         <p className="text-sm text-muted-foreground mt-1">
                           Your account is linked to the wallet: <span className="font-mono text-primary/80 text-xs">{profile.walletAddress}</span>
                         </p>
                      ): (
                         <p className="text-sm text-muted-foreground mt-1">
                            No wallet is currently linked to your account.
                         </p>
                      )}
                     
                    </div>
                    <div className="mt-4 sm:mt-0">
                      {profile.walletAddress ? (
                         <Button variant="destructive" onClick={handleDisconnectWallet}>
                           <Unlink /> Disconnect Wallet
                         </Button>
                      ) : (
                         <Button variant="outline" onClick={connectWallet}>
                           <WalletCards /> Connect Wallet
                         </Button>
                      )}
                    </div>
                  </div>
              </Card>

              <WorldIdVerification
                verified={profile.worldIdVerified}
                verifiedAt={profile.worldIdVerifiedAt}
              />

              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input id="password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <Button onClick={handleSecurityUpdate} disabled={savingSecurity}>
                {savingSecurity ? <Loader2 className="animate-spin" /> : "Update Security"}
              </Button>

            </CardContent>
          </Card>
          
          {currentUser && <SessionManagement currentUser={currentUser} />}

        </TabsContent>
        <TabsContent value="privacy" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline">Privacy</CardTitle>
              <CardDescription>Control your privacy settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <h3 className="font-medium">Make Profile Private</h3>
                  <p className="text-sm text-muted-foreground">
                    Only followers will be able to see your artwork and details.
                  </p>
                </div>
                {loadingProfile ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Switch
                    checked={profile.isPrivate || false}
                    onCheckedChange={handlePrivacyChange}
                    disabled={savingPrivacy}
                    aria-label="Make profile private"
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="membership" className="mt-6">
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Account Type &amp; Membership</CardTitle>
                    <CardDescription>Manage your account role and subscription status.</CardDescription>
                </CardHeader>
                <CardContent>
                    {getMembershipContent()}
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
