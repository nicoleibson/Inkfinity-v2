
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
import { User, Shield, Lock, Loader2, Camera, ShieldCheck, ShieldX, Upload, UserCheck, WalletCards, Unlink, Crown, MapPin, Instagram, Twitter, Link as LinkIcon, BookUser, AlertCircle, CalendarDays, MessageCircle, Send, CheckCircle2, HardDrive, ExternalLink, Cloud } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { verifyFace } from '@/ai/flows/verify-face-flow';
import type { VerifyFaceOutput } from '@/ai/schemas/verify-face-schema';
import { geocodeAddress } from '@/ai/flows/geocode-address-flow';
import { auth, database } from '@/lib/firebase-config';
import { onAuthStateChanged, User as FirebaseUser, updateProfile as updateAuthProfile, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import type { UserProfile } from '@/types/user';
import { get, ref, update, onValue } from 'firebase/database';
import { requestCamera, cameraErrorTitle, cameraErrorDescription } from '@/lib/client/camera';
import type { CameraDiagnostics } from '@/lib/client/camera';

const FACE_CONFIDENCE_THRESHOLD = 0.8;
import { getVerificationLock, registerVerificationFailure, resetVerificationFailures, formatRetryTime } from '@/lib/face-lock';
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
import { uploadDataUri } from '@/lib/firebase/storage';
import { uploadProfileImageToGoogleDrive, authorizeGoogleDrive, getCachedDriveAccessToken, getDriveFolderUrl } from '@/lib/google-drive';
import { captureFaceFrame, captureLiveSequence } from '@/lib/client/face-capture';

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

  const [hasCameraPermission, setHasCameraPermission] = React.useState<boolean | null>(null);
  const [cameraError, setCameraError] = React.useState<CameraDiagnostics | null>(null);
  const [cameraRetryKey, setCameraRetryKey] = React.useState(0);
  const [isProcessingFace, setIsProcessingFace] = React.useState(false);
  const [verificationResult, setVerificationResult] = React.useState<VerifyFaceOutput | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  const { walletAddress, disconnectWallet, isConnected, connectWallet } = useWallet();

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = getCachedDriveAccessToken();
      if (token) setDriveConnected(true);
    }
  }, []);

  const handleConnectDrive = async () => {
    setIsConnectingDrive(true);
    try {
      const token = await authorizeGoogleDrive();
      if (token) {
        setDriveConnected(true);
        toast({
          title: "Google Drive Vinculado",
          description: "Tus fotos de perfil y obras se guardarán en tu carpeta pública 'Inkfinity Artworks'.",
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

      let driveToken = getCachedDriveAccessToken();
      const existingFolderId = profile.googleDriveFolderId || undefined;

      if (avatarFile && avatarPreview) {
        let avatarUrl = '';
        let driveSuccess = false;

        // Prefer Google Drive upload to the user's unified Inkfinity folder
        try {
          if (!driveToken) {
            driveToken = await authorizeGoogleDrive();
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
            updates[`/users/${currentUser.uid}/googleDriveFolderId`] = driveRes.folderId;
            updates[`/users/${currentUser.uid}/avatarDriveFileId`] = driveRes.fileId;
            updates[`/users/${currentUser.uid}/avatarUrl`] = avatarUrl;
            setProfile(prev => ({ ...prev, googleDriveFolderId: driveRes.folderId, avatarDriveFileId: driveRes.fileId, avatarUrl }));
            driveSuccess = true;
          }
        } catch (driveErr) {
          console.warn("Google Drive upload for avatar failed/cancelled, falling back to storage:", driveErr);
        }

        if (!driveSuccess) {
          const avatarPath = `profiles/${currentUser.uid}/avatar.jpg`;
          avatarUrl = await uploadDataUri(avatarPath, avatarPreview);
          updates[`/users/${currentUser.uid}/avatarUrl`] = avatarUrl;
        }

        await updateAuthProfile(currentUser, { photoURL: avatarUrl });
      }

      if (backgroundFile && backgroundPreview) {
        let backgroundUrl = '';
        let driveSuccess = false;

        // Prefer Google Drive upload to the user's unified Inkfinity folder
        try {
          if (!driveToken) {
            driveToken = await authorizeGoogleDrive();
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
            updates[`/users/${currentUser.uid}/googleDriveFolderId`] = driveRes.folderId;
            updates[`/users/${currentUser.uid}/backgroundDriveFileId`] = driveRes.fileId;
            updates[`/users/${currentUser.uid}/backgroundUrl`] = backgroundUrl;
            setProfile(prev => ({ ...prev, googleDriveFolderId: driveRes.folderId, backgroundDriveFileId: driveRes.fileId, backgroundUrl }));
            driveSuccess = true;
          }
        } catch (driveErr) {
          console.warn("Google Drive upload for background failed/cancelled, falling back to storage:", driveErr);
        }

        if (!driveSuccess) {
          const backgroundPath = `profiles/${currentUser.uid}/background.jpg`;
          backgroundUrl = await uploadDataUri(backgroundPath, backgroundPreview);
          updates[`/users/${currentUser.uid}/backgroundUrl`] = backgroundUrl;
        }
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


  const handle2FAToggle = async (enabled: boolean) => {
    if (!currentUser) return;
    setProfile(prev => ({...prev, twoFactorEnabled: enabled}));

    const userRef = ref(database, `users/${currentUser.uid}`);
    try {
        await update(userRef, { twoFactorEnabled: enabled });
        toast({
            title: `Facial Scan ${enabled ? 'Enabled' : 'Disabled'}`,
            description: `Two-factor authentication has been ${enabled ? 'activated' : 'deactivated'}.`,
        });
        if (!enabled) {
            setVerificationResult(null);
        }
    } catch (error) {
        console.error('2FA toggle error:', error);
        toast({ variant: 'destructive', title: 'Update Failed' });
        setProfile(prev => ({...prev, twoFactorEnabled: !enabled}));
    }
  };
  
  React.useEffect(() => {
    let stream: MediaStream | null = null;
    const getCameraPermission = async () => {
      if (profile.twoFactorEnabled) {
        const result = await requestCamera();
        if (result.ok) {
          stream = result.stream;
          setHasCameraPermission(true);
          setCameraError(null);
          if (videoRef.current) {
            videoRef.current.srcObject = result.stream;
          }
        } else {
          console.error('Error accessing camera:', result.diagnostics);
          setHasCameraPermission(false);
          setCameraError(result.diagnostics);
          toast({
            variant: 'destructive',
            title: cameraErrorTitle(result.diagnostics.error),
            description: cameraErrorDescription(result.diagnostics.error),
          });
        }
      }
    };
    getCameraPermission();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    }
  }, [profile.twoFactorEnabled, toast, cameraRetryKey]);

  const captureAndProcessFace = async (action: 'register' | 'verify') => {
    if (!videoRef.current || !currentUser) return;
    setIsProcessingFace(true);
    setVerificationResult(null);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (canvas && video) {
      try {
        const frame = await captureFaceFrame(video, canvas);

        if (frame.faceCount === 0) {
          toast({ variant: 'destructive', title: 'No Face Detected', description: 'A face must be clearly visible in the frame to continue.' });
          return;
        }
        if (frame.faceCount > 1) {
          toast({ variant: 'destructive', title: 'Multiple Faces Detected', description: 'Only one person should be in the frame.' });
          return;
        }

        if (action === 'register') {
            const liveness = await captureLiveSequence(video, canvas);
            let facialScanUrl = frame.dataUri;
            if (liveness !== "unavailable") {
              if (!liveness.isLive) {
                toast({ variant: 'destructive', title: 'Liveness Check Failed', description: liveness.reason });
                return;
              }
              if (liveness.frames.length > 0) facialScanUrl = liveness.frames[0];
            } else {
              console.warn("Liveness model unavailable, skipping liveness check.");
            }

            const updates: Partial<UserProfile> = { facialScanUrl };
            await update(ref(database, `users/${currentUser.uid}`), updates);
            setProfile(prev => ({...prev, ...updates}));

            toast({ title: 'Face Registered', description: 'Your facial scan has been securely saved.' });
        } else if (action === 'verify') {
          if (!profile.facialScanUrl) {
            toast({ variant: 'destructive', title: 'No Face Registered', description: 'Please register your face first.' });
            return;
          }

          const lock = await getVerificationLock(currentUser.uid);
          if (!lock.allowed) {
            toast({ variant: 'destructive', title: 'Too Many Attempts', description: `Try again in ${formatRetryTime(lock.retryAfterMs)}.` });
            return;
          }

          // Liveness gate.
          const liveness = await captureLiveSequence(video, canvas);
          let liveDataUri = frame.dataUri;
          if (liveness !== "unavailable") {
            if (!liveness.isLive) {
              await registerVerificationFailure(currentUser.uid);
              toast({ variant: 'destructive', title: 'Liveness Check Failed', description: liveness.reason });
              return;
            }
            if (liveness.frames.length > 0) liveDataUri = liveness.frames[0];
          } else {
            console.warn("Liveness model unavailable, skipping liveness check.");
          }

          const primaryFrame = liveness !== "unavailable" && liveness.frames.length > 0 ? liveness.frames[0] : frame.dataUri;
          const frame2 = liveness !== "unavailable" && liveness.frames.length > 1 ? liveness.frames[1] : primaryFrame;
          const frame3 = liveness !== "unavailable" && liveness.frames.length > 2 ? liveness.frames[2] : primaryFrame;

          // Deterministic identity check (face embeddings) is disabled, using AI verification directly.
          const result = await verifyFace({
            registeredImageUrl: profile.facialScanUrl,
            liveCaptureDataUri: primaryFrame,
            liveCaptureFrame2: frame2,
            liveCaptureFrame3: frame3,
          });
          setVerificationResult(result);

          const accepted = result.isMatch && (result.confidence ?? 0) >= FACE_CONFIDENCE_THRESHOLD;
          const confidencePercent = Math.round((result.confidence ?? 0) * 100);
          if (accepted) {
            await resetVerificationFailures(currentUser.uid);
            toast({
              title: 'Verification Successful',
              description: `${result.reason} (confidence ${confidencePercent}%).`,
              variant: 'default',
            });
          } else {
            await registerVerificationFailure(currentUser.uid);
            toast({
              variant: 'destructive',
              title: 'Verification Failed',
              description: `${result.reason} (confidence ${confidencePercent}%).`,
            });
          }
        }
      } catch (error) {
        console.error(`${action} error:`, error);
        toast({
          variant: 'destructive',
          title: `${action.charAt(0).toUpperCase() + action.slice(1)} Error`,
          description: `An unexpected error occurred during face ${action}.`,
        });
      } finally {
        setIsProcessingFace(false);
      }
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
                              Tus fotos de perfil, imágenes de portada y obras se almacenan en tu propia carpeta pública <span className="font-medium text-foreground">Inkfinity Artworks</span>.
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

              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input id="password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
                <Button onClick={handleSecurityUpdate} disabled={savingSecurity}>
                    {savingSecurity ? <Loader2 className="animate-spin" /> : "Update Security"}
                </Button>
              <Card className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-md font-medium">Facial Scan Login (2FA)</h3>
                      <p className="text-sm text-muted-foreground mb-2">Enhance your security with AI-powered identity verification.</p>
                    </div>
                    <Switch checked={profile.twoFactorEnabled || false} onCheckedChange={handle2FAToggle} disabled={loadingProfile}/>
                  </div>
                  {profile.twoFactorEnabled && (
                    <div className="mt-4 space-y-4 border-t pt-4">
                      {hasCameraPermission === false && (
                        <Alert variant="destructive">
                          <Camera className="h-4 w-4" />
                          <AlertTitle>{cameraError ? cameraErrorTitle(cameraError.error) : 'Camera Access Required'}</AlertTitle>
                          <AlertDescription className="flex flex-col gap-2">
                            {cameraError ? cameraErrorDescription(cameraError.error) : 'Please allow camera access in your browser to use this feature.'}
                            <Button onClick={() => setCameraRetryKey(k => k + 1)} variant="outline" size="sm" className="self-start">
                              Try Again
                            </Button>
                          </AlertDescription>
                        </Alert>
                      )}
                      <div className="relative aspect-video w-full max-w-sm mx-auto bg-muted rounded-md overflow-hidden">
                        <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                        <canvas ref={canvasRef} className="hidden" />
                      
                      </div>
                      
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button onClick={() => captureAndProcessFace('register')} disabled={!hasCameraPermission || isProcessingFace} className="w-full">
                          {isProcessingFace ? <Loader2 className="animate-spin" /> : <UserCheck />}
                          {isProcessingFace ? 'Registering...' : (profile.facialScanUrl ? 'Re-register Face' : 'Register Face')}
                        </Button>
                        <Button onClick={() => captureAndProcessFace('verify')} disabled={!hasCameraPermission || isProcessingFace || !profile.facialScanUrl} className="w-full" variant="secondary">
                          {isProcessingFace ? <Loader2 className="animate-spin" /> : <Camera />}
                          {isProcessingFace ? "Verifying..." : "Verify Identity"}
                        </Button>
                      </div>

                      {verificationResult && (
                        <Alert variant={verificationResult.isMatch ? "default" : "destructive"} className="flex items-center gap-4">
                           {verificationResult.isMatch ? <ShieldCheck className="h-5 w-5 text-green-500" /> : <ShieldX className="h-5 w-5 text-red-500" />}
                          <div>
                            <AlertTitle>{verificationResult.isMatch ? "Verification Successful" : "Verification Failed"}</AlertTitle>
                            <AlertDescription>{verificationResult.reason} (confidence {Math.round((verificationResult.confidence ?? 0) * 100)}%).</AlertDescription>
                          </div>
                        </Alert>
                      )}
                    </div>
                  )}
                </Card>
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
