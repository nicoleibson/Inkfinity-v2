
// src/app/(auth)/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Palette, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { auth, database } from "@/lib/firebase-config";
import { signInWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { useToast } from "@/hooks/use-toast";
import { get, ref, update } from "firebase/database";
import type { UserProfile } from "@/types/user";

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setVerificationSent(false);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (!user.emailVerified) {
        setError("Please verify your email address to log in. Click the button below to resend the verification email.");
        setVerificationSent(true);
        setLoading(false);
        return;
      }

      // Check user profile for status and 2FA
      const userRef = ref(database, `users/${user.uid}`);
      const snapshot = await get(userRef);

      if (!snapshot.exists()) {
        // This case can happen if the user verified their email but didn't complete the profile setup.
        // We can redirect them to the setup part of the signup flow.
        toast({ variant: 'destructive', title: "Profile Incomplete", description: "Please complete your profile setup." });
        router.push('/signup'); // The signup form should handle existing but incomplete users.
        return;
      }

      const profile: UserProfile = snapshot.val();

      // Check for expired artist trial or pending payment status first
      const isTrialExpired = profile.role === 'Tattoo Artist' && profile.trialEndsAt && new Date() > new Date(profile.trialEndsAt);
      if (isTrialExpired && profile.status !== 'pending_payment') {
          await update(userRef, { status: 'pending_payment' });
          router.push('/payment');
          return;
      }
      
      if (profile.status === 'pending_payment') {
        router.push('/payment');
        return;
      }
      
      if (profile.twoFactorEnabled && profile.facialScanUrl) {
        // Redirect to 2FA verification page
        router.push('/verify-face');
      } else {
        // Standard login, redirect to homepage
        toast({
          title: "Login Successful",
          description: "Welcome back to Inkfinity!",
        });
        router.push("/");
      }

    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    } 
  };

  const handleResendVerification = async () => {
      const user = auth.currentUser;
      if(user){
        try {
            await sendEmailVerification(user);
            toast({
                title: "Verification Email Sent",
                description: "Please check your inbox.",
            });
        } catch (err: any) {
            setError("Failed to resend verification email. Please try again later.");
        }
      } else {
        // This case is unlikely if we got here from a failed login, but good for robustness
        setError("No user is currently signed in to resend verification for.");
      }
  }

  return (
    <Card className="w-full max-w-sm border-primary/20">
      <form onSubmit={handleLogin}>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Palette className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="font-headline text-2xl">Welcome Back</CardTitle>
          <CardDescription>Sign in to continue your artistic journey.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Login Failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="m@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-sm text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Sign In"}
          </Button>
          {verificationSent && (
              <Button variant="outline" className="w-full" onClick={handleResendVerification}>Resend Verification Email</Button>
          )}
          <div className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="underline hover:text-primary">
              Sign up
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
