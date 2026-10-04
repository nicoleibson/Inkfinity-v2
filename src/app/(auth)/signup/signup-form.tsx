
"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Palette, Sparkles, User as UserIcon, CheckCircle, MailCheck, Chrome, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { generateOnboardingContent } from "@/ai/flows/onboarding-assistant";
import { moderateImage } from "@/ai/flows/image-moderation";
import type { GenerateOnboardingContentOutput } from "@/ai/schemas/onboarding-assistant-schema";
import { useToast } from "@/hooks/use-toast";
import { auth, database } from "@/lib/firebase-config";
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile, reload, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signInWithCustomToken, type User as FirebaseUser } from "firebase/auth";
import { ref as dbRef, set, update, get } from "firebase/database";
import { add } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { uploadProfileImageToGoogleDrive, getCachedDriveAccessToken } from '@/lib/google-drive';

export default function SignupForm() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "",
    stylePreferences: "",
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(true); // Start as loading to check auth state
  const [aiResult, setAiResult] = useState<GenerateOnboardingContentOutput | null>(null);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const verificationCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Helper to create session cookie after successful auth
  const createSessionCookie = async (user: any) => {
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (!response.ok) {
        console.error('Failed to create session cookie');
      }
    } catch (err) {
      console.error('Failed to create session cookie:', err);
    }
  };
  
  useEffect(() => {
    // Check auth state on initial load
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is logged in, check if profile exists
            const userRef = dbRef(database, `users/${user.uid}`);
            const snapshot = await get(userRef);

            if (snapshot.exists() && snapshot.val().onboardingComplete) {
                // Profile complete, should not be on signup page
                window.location.href = '/'; // Hard redirect
            } else if (user.emailVerified) {
                // Verified but no profile, jump to step 3
                setFormData(prev => ({ ...prev, email: user.email! }));
                setStep(3);
            } else {
                // Not verified, show step 2
                setFormData(prev => ({ ...prev, email: user.email! }));
                setStep(2);
                startVerificationPolling();
            }
        }
        setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
        if (verificationCheckInterval.current) {
            clearInterval(verificationCheckInterval.current);
        }
    };
  }, []);

  const startVerificationPolling = () => {
     if (verificationCheckInterval.current) {
        clearInterval(verificationCheckInterval.current);
     }
     verificationCheckInterval.current = setInterval(async () => {
        const currentUser = auth.currentUser;
        if (currentUser) {
            await reload(currentUser);
            if (currentUser.emailVerified) {
                if (verificationCheckInterval.current) {
                    clearInterval(verificationCheckInterval.current);
                }
                toast({ title: "Email Verified!", description: "You can now complete your profile.", className: "bg-green-500 text-white" });
                setStep(3); // Move to profile details step
            }
        }
    }, 3000); // Check every 3 seconds
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData({ ...formData, [name]: value });
  };
  
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImageUri(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleCreateAccountAndVerify = async () => {
    setLoading(true);

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        await createSessionCookie(userCredential.user);
        await sendEmailVerification(userCredential.user);
        toast({ title: "Verification Email Sent", description: `A verification link has been sent to ${formData.email}. Please check your inbox.` });
        setStep(2); // Move to verification waiting step
        startVerificationPolling();

    } catch (error: any) {
        if (error.code === 'auth/email-already-in-use') {
            toast({
                variant: "destructive",
                title: "Signup Failed",
                description: "This email address is already in use. Please use a different email or log in.",
            });
        } else {
             toast({
                variant: "destructive",
                title: "Signup Failed",
                description: error.message || "An unexpected error occurred.",
            });
        }
    } finally {
        setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      const result = await signInWithPopup(auth, provider);
      await createSessionCookie(result.user);
      const user = result.user;
      // For Google signup, we skip email verification and go straight to profile setup
      setFormData(prev => ({ ...prev, email: user.email! }));
      setStep(3);
      toast({ title: "Google Account Linked", description: "Now complete your profile." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Google Signup Failed", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleWorldIdSignup = async () => {
    setLoading(true);
    try {
      const { IDKit, orbLegacy } = await import('@worldcoin/idkit');

      // Get RP context from public endpoint
      const rpResponse = await fetch('/api/auth/worldid/rp-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!rpResponse.ok) throw new Error(`RP context failed (${rpResponse.status})`);
      const rp = await rpResponse.json();

      const request = await IDKit.request({
        app_id: (process.env.NEXT_PUBLIC_WORLD_APP_ID || '') as `app_${string}`,
        action: 'inkfinity-auth',
        rp_context: {
          rp_id: rp.rp_id,
          nonce: rp.nonce,
          created_at: rp.created_at,
          expires_at: rp.expires_at,
          signature: rp.signature,
        },
        allow_legacy_proofs: true,
        environment: rp.environment,
      }).preset(orbLegacy());

      const completion = await request.pollUntilCompletion({ timeout: 120000 });
      if (!completion.success) {
        throw new Error(completion.error || 'Verification was not completed.');
      }

      // Send to signup endpoint with profile data
      const signupResponse = await fetch('/api/auth/worldid/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idkitResponse: completion.result,
          firstName: formData.firstName,
          lastName: formData.lastName,
          role: formData.role,
          stylePreferences: formData.stylePreferences,
        }),
      });

      if (!signupResponse.ok) {
        const body = await signupResponse.json().catch(() => null);
        throw new Error(body?.detail || body?.error || 'World ID signup failed.');
      }

      const { customToken } = await signupResponse.json();
      await signInWithCustomToken(auth, customToken);
      await createSessionCookie(auth.currentUser!);

      // After sign-in, go to step 4 (bio/avatar) since profile basics are already set
      setStep(4);
      toast({ title: "World ID Signup Successful", description: "Complete your bio and profile picture." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "World ID Signup Failed", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateContent = async () => {
    setLoading(true);
    const user = auth.currentUser;
    if (!user) {
        toast({ variant: "destructive", title: "Signup Error", description: "No user session found." });
        setLoading(false);
        return;
    }
    
    try {
        // --- START: Create user profile in DB on step 3 ---
        const usernameBase = `${formData.firstName.toLowerCase()}${formData.lastName.toLowerCase()}`.replace(/[^a-z0-9]/g, '');
        const usernameRef = dbRef(database, `usernames/${usernameBase}`);
        const usernameSnapshot = await get(usernameRef);
        
        let username = usernameBase;
        if (usernameSnapshot.exists()) {
            username = `${usernameBase}${Math.floor(Math.random() * 1000)}`;
        }

        let status: 'pending_payment' | 'active' = 'active';
        if (formData.role === 'Studio' || formData.role === 'Supply Store') {
            status = 'pending_payment';
        }

        let trialEndsAt = null;
        if (formData.role === 'Tattoo Artist') {
            trialEndsAt = add(new Date(), { months: 3 }).toISOString();
        }

        const userData = {
            name: `${formData.firstName} ${formData.lastName}`,
            username: username,
            email: user.email,
            role: formData.role,
            status: status,
            bio: "", // Will be filled in by AI
            avatarUrl: "https://placehold.co/200x200.png",
            backgroundUrl: '',
            walletAddress: "",
            onboardingComplete: false, // Mark as incomplete for now
            creationTime: new Date().toISOString(),
            points: 0,
            followersCount: 0,
            followingCount: 0,
            artworksCount: 0,
            collectionCount: 0,
            twoFactorEnabled: false,
            storageUsed: 0,
            trialEndsAt: trialEndsAt,
            artistRequestStatus: 'none',
            referralCodeUsed: false,
            legal: {
                globalTerms: true,
                acceptedAt: new Date().toISOString(),
            },
        };
        
        const updates: { [key: string]: any } = {};
        updates[`/users/${user.uid}`] = userData;
        updates[`/usernames/${username}`] = user.uid;
        
        await update(dbRef(database), updates);
        await updateProfile(user, { displayName: userData.name });
        // --- END: Create user profile in DB ---


      const result = await generateOnboardingContent({
        userId: user.uid,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        stylePreferences: formData.stylePreferences,
      });
      setAiResult(result);
      setStep(4);
    } catch (error) {
      console.error("Error generating onboarding content:", error);
      toast({
        variant: "destructive",
        title: "AI Assistant Error",
        description: "Could not generate profile suggestions. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };
  
  const handleBioChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (aiResult) {
        setAiResult({ ...aiResult, bio: e.target.value });
    }
  };

  const handleFinalSignup = async () => {
    setLoading(true);
    const user = auth.currentUser;
    if (!aiResult || !user) {
      toast({ variant: "destructive", title: "Signup Error", description: "Missing content or user session." });
      setLoading(false);
      return;
    }

    try {
      const userRef = dbRef(database, `users/${user.uid}`);
      
      let avatarUrl = 'https://placehold.co/200x200.png';
      let driveFolderId: string | null = null;
      let driveFileId: string | null = null;

      if (profileImageUri) {
          const moderationResult = await moderateImage({ photoDataUri: profileImageUri });
          if (!moderationResult.isSafe) {
              toast({
                  variant: "destructive",
                  title: "Inappropriate Image Detected",
                  description: moderationResult.reason || "The uploaded profile picture violates our community guidelines.",
              });
              setLoading(false);
              return;
          }
          
          // Upload avatar (prefer Google Drive if connected for this specific email, fallback to storage)
          let driveSuccess = false;
          const driveToken = getCachedDriveAccessToken(user.email!);

          if (driveToken) {
            try {
              const driveRes = await uploadProfileImageToGoogleDrive(
                driveToken,
                user.uid,
                'avatar',
                profileImageUri
              );
              avatarUrl = driveRes.imageUrl;
              driveFolderId = driveRes.folderId;
              driveFileId = driveRes.fileId;
              driveSuccess = true;
            } catch (dErr) {
              console.warn("Drive upload failed during signup, using storage:", dErr);
            }
          }

          if (!driveSuccess) {
            throw new Error("Se requiere vinculación con Google Drive para subir imágenes.");
          }
      }
      
      const userUpdates: Record<string, any> = {
        bio: aiResult.bio,
        avatarUrl: avatarUrl, // Save the storage URL or default placeholder
        onboardingComplete: true,
      };

      if (driveFolderId) {
        userUpdates.googleDriveFolderId = driveFolderId;
      }
      if (driveFileId) {
        userUpdates.avatarDriveFileId = driveFileId;
      }

      await update(userRef, userUpdates);

      // Update Firebase Auth profile as well
      await updateProfile(user, { photoURL: avatarUrl });

      setStep(5); // Final success step

    } catch (error: any) {
      console.error("Final signup error:", error);
       toast({
          variant: "destructive",
          title: "Signup Failed",
          description: error.message || "An unexpected error occurred.",
      });
    } finally {
      setLoading(false);
    }
  };
  
  const showStyleField = formData.role === 'Tattoo Artist' || formData.role === 'Client';
  
  if (loading) {
      return (
          <Card className="w-full max-w-md border-primary/20 flex justify-center items-center h-96">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </Card>
      );
  }

  if (step === 5) { // Final Success Step
    let message = `Your account has been created and verified. Welcome to Inkfinity!`;
    let redirectUrl = '/login';
    let buttonText = 'Go to Login';

    if (formData.role === 'Studio' || formData.role === 'Supply Store') {
        message = `Your account is verified! You will now be redirected to complete the registration payment.`;
        redirectUrl = '/payment';
        buttonText = 'Proceed to Payment';
    }

    return (
      <Card className="w-full max-w-md border-primary/20">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4 text-green-500">
            <CheckCircle className="h-16 w-16" />
          </div>
          <CardTitle className="font-headline text-2xl">Signup Complete!</CardTitle>
          <CardDescription dangerouslySetInnerHTML={{ __html: message }} />
        </CardHeader>
        <CardFooter>
            <Button className="w-full" asChild>
                <Link href={redirectUrl}>{buttonText}</Link>
            </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border-primary/20">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <Palette className="h-12 w-12 text-primary" />
        </div>
        <CardTitle className="font-headline text-2xl">Join Inkfinity</CardTitle>
        <CardDescription>
          {step === 1 && "Create your account to get started."}
          {step === 2 && `We've sent a verification link to ${formData.email}.`}
          {step === 3 && "Tell us a bit about yourself."}
          {step === 4 && "Set up your bio and choose an optional profile picture."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === 1 && (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="m@example.com" value={formData.email} onChange={handleChange} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" value={formData.password} onChange={handleChange} required />
            </div>
            <div className="grid gap-2">
              <Button variant="outline" className="w-full" onClick={handleGoogleSignup} disabled={loading}>
                <Chrome className="mr-2 h-4 w-4" />
                Continue with Google
              </Button>
              <Button variant="outline" className="w-full" onClick={handleWorldIdSignup} disabled={loading}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Continue with World ID
              </Button>
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with email</span>
              </div>
            </div>
            <div className="grid gap-2">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="m@example.com" value={formData.email} onChange={handleChange} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" value={formData.password} onChange={handleChange} required />
              </div>
              <div className="flex items-center space-x-2 mt-2">
                  <Checkbox id="terms" checked={agreedToTerms} onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)} />
                  <label
                      htmlFor="terms"
                      className="text-sm font-medium leading-none text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                      I agree to the{" "}
                      <Link href="/terms" target="_blank" className="underline hover:text-primary">
                      Terms and Conditions
                      </Link>
                  </label>
              </div>
            </div>
          </div>
        )}
        {step === 2 && (
            <div className="text-center space-y-4">
                <MailCheck className="h-16 w-16 mx-auto text-primary" />
                <p className="text-muted-foreground">Please check your inbox (and spam folder) and click the link to verify your email address. This page will update automatically once you're verified.</p>
                <Loader2 className="h-8 w-8 mx-auto animate-spin" />
                <p className="text-xs text-muted-foreground">Waiting for verification...</p>
            </div>
        )}
        {step === 3 && (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" name="firstName" value={formData.firstName} onChange={handleChange} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" name="lastName" value={formData.lastName} onChange={handleChange} required />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Your Role</Label>
              <Select name="role" onValueChange={(value) => handleSelectChange("role", value)} value={formData.role}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tattoo Artist">Tattoo Artist</SelectItem>
                  <SelectItem value="Client">Client</SelectItem>
                  <SelectItem value="Studio">Studio</SelectItem>
                  <SelectItem value="Supply Store">Supply Store</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {showStyleField && (
              <div className="grid gap-2">
                <Label htmlFor="stylePreferences">Style Preferences</Label>
                <Input id="stylePreferences" name="stylePreferences" placeholder="e.g., Traditional, Oriental" value={formData.stylePreferences} onChange={handleChange} />
              </div>
            )}
          </div>
        )}
        {step === 4 && aiResult && (
          <div className="space-y-6 text-center">
            <div className="flex flex-col items-center gap-4">
              <Label htmlFor="profile-image-upload" className="cursor-pointer">
                <Avatar className="h-32 w-32 border-4 border-primary shadow-lg hover:opacity-80 transition-opacity">
                  <AvatarImage src={profileImageUri || "https://placehold.co/200x200.png"} alt="Profile Image" />
                  <AvatarFallback><UserIcon className="h-16 w-16" /></AvatarFallback>
                </Avatar>
              </Label>
              <Input 
                id="profile-image-upload" 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleImageChange} 
              />
              <Label htmlFor="profile-image-upload" className="cursor-pointer text-sm font-medium text-primary hover:underline">
                {profileImageUri ? "Change Profile Picture" : "Upload Profile Picture (Optional)"}
              </Label>
              <p className="text-xs text-muted-foreground">A default picture is assigned if you do not upload one.</p>
              {profileImageUri && (
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-destructive" onClick={() => setProfileImageUri(null)}>
                  Remove picture
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleGenerateContent} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Regenerate Bio
              </Button>
            </div>
            <div className="text-left space-y-2">
              <Label htmlFor="bio" className="flex items-center gap-2">
                Suggested Bio
              </Label>
              <Textarea id="bio" value={aiResult.bio} onChange={handleBioChange} rows={4} />
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col gap-4">
        {step === 1 && <Button className="w-full" onClick={handleCreateAccountAndVerify} disabled={!agreedToTerms || !formData.email || !formData.password || loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Continue"}</Button>}
        {step === 3 && (
          <Button className="w-full" onClick={handleGenerateContent} disabled={loading || !formData.role || !formData.firstName || !formData.lastName}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate Profile with AI
          </Button>
        )}
        {step === 4 && <Button className="w-full" onClick={handleFinalSignup} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Complete Signup"}</Button>}
        
        {step !== 2 && (
            <div className="text-center text-sm text-muted-foreground">
                {step > 1 && step < 5 && <Button variant="link" onClick={() => setStep(step - 1)}>Back</Button>}
                Already have an account?{" "}
                <Link href="/login" className="underline hover:text-primary">
                    Sign in
                </Link>
            </div>
        )}
      </CardFooter>
    </Card>
  );
}
