// src/app/(auth)/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Palette, AlertCircle, Loader2, Mail, Chrome, ShieldCheck, AlertCircle as AlertCircleIcon } from "lucide-react";
import Link from "next/link";
import { auth, database } from "@/lib/firebase-config";
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signInWithCustomToken, sendEmailVerification, sendPasswordResetEmail } from "firebase/auth";
import { useToast } from "@/hooks/use-toast";
import { get, ref, update } from "firebase/database";
import type { UserProfile } from "@/types/user";
import { hasActiveMembership } from "@/lib/utils/membership";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { saveProof } from '@/utils/worldid-proof';

function formatAuthError(err: any): string {
  if (!err) return "An unexpected error occurred. Please try again.";
  const code = err.code || "";
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-email':
      return 'Invalid email or password. Please verify your credentials and try again.';
    case 'auth/too-many-requests':
      return 'Access to this account has been temporarily disabled due to multiple failed login attempts. Please try again later.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/popup-closed-by-user':
      return 'The sign-in popup was closed before completing.';
    case 'auth/popup-blocked':
      return 'Popup was blocked by your browser. Please allow popups for this site.';
    case 'auth/network-request-failed':
      return 'Network connection error. Please check your internet connection.';
    default:
      if (typeof err.message === 'string') {
        const cleaned = err.message.replace(/^Firebase:\s*(Error\s*)?(\(auth\/[^)]+\)\.?\s*)?/i, '').trim();
        return cleaned || 'Failed to sign in. Please try again.';
      }
      return 'An unexpected error occurred. Please try again.';
  }
}

import { Suspense } from "react";

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/';

  // Helper to create session cookie after successful auth
  const createSessionCookie = async (user: any) => {
    try {
      const idToken = await user.getIdToken(true);
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(30000),
        credentials: 'include', // ensure HttpOnly cookie is sent
      });
      if (!response.ok) {
        console.error('Failed to create session cookie:', response.status);
      }
    } catch (err) {
      console.error('Failed to create session cookie:', err);
    }
  };

  const completeLogin = async (user: any) => {
    // Esperar a que la cookie __session se establezca en el navegador antes de navegar
    // para que el middleware no rechace las rutas privadas.
    await createSessionCookie(user);

    try {
      // Check user profile for status and 2FA
      const userRef = ref(database, `users/${user.uid}`);
      const snapshot = await get(userRef);

      if (!snapshot.exists()) {
        toast({ variant: 'destructive', title: "Profile Incomplete", description: "Please complete your profile setup." });
        setLoading(false);
        router.replace('/signup');
        return;
      }

      const profile: UserProfile = snapshot.val();

      // Check for expired artist trial or pending payment status first
      const isTrialExpired = profile.role === 'Tattoo Artist' && profile.trialEndsAt && new Date() > new Date(profile.trialEndsAt);
      if (isTrialExpired && profile.status !== 'pending_payment') {
        await update(userRef, { status: 'pending_payment' });
        setLoading(false);
        router.replace('/payment');
        return;
      }

      if (profile.status === 'pending_payment') {
        setLoading(false);
        router.replace('/payment');
        return;
      }

      // Facial verification is only enforced for members with an active paid
      // membership, so it must not be requested from anyone else here: the
      // verify-face page would reject them and bounce them back.
      if (profile.twoFactorEnabled && profile.facialScanUrl && hasActiveMembership(profile)) {
        setLoading(false);
        const verifyUrl = redirectPath && redirectPath !== '/' 
          ? `/verify-face?redirect=${encodeURIComponent(redirectPath)}` 
          : '/verify-face';
        router.replace(verifyUrl);
      } else {
        // Si el usuario tiene 2FA habilitado pero no tiene facialScanUrl registrado
        // y tiene membresía activa, sugerir registrarse ahora
        const has2FANoScan = profile?.twoFactorEnabled === true && !profile.facialScanUrl && hasActiveMembership(profile);
        const baseMessage = "Welcome back to Inkfinity!";
        let message = baseMessage;
        if (has2FANoScan) {
          message = "¡Bienvenido de nuevo a Inkfinity! Para continuar, completa tu verificación facial en la configuración.";
        }
        toast({ title: "Login Successful", description: message });
        setLoading(false);
        router.replace(redirectPath);
      }
    } catch (err: any) {
      console.error('completeLogin error:', err);
      setLoading(false);
      router.replace(redirectPath);
    }
  };

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

      await completeLogin(user);
    } catch (err: any) {
      setError(formatAuthError(err));
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      const result = await signInWithPopup(auth, provider);
      await completeLogin(result.user);
    } catch (err: any) {
      setError(formatAuthError(err));
      setLoading(false);
    }
  };


  const [unlinked, setUnlinked] = useState(false);

  const handleWorldIdLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const { IDKit, orbLegacy } = await import('@worldcoin/idkit');

      // Get RP context from public endpoint (no auth required for login flow)
      const rpResponse = await fetch('/api/auth/worldid/rp-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!rpResponse.ok) {
        const errorData = await rpResponse.json().catch(() => null);
        throw new Error(errorData?.detail || errorData?.error || `RP context failed (${rpResponse.status})`);
      }
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

      // Save proof for potential signup flow
      saveProof(completion.result);

      // Send to login endpoint
      const loginResponse = await fetch('/api/auth/worldid/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idkitResponse: completion.result }),
      });

      if (!loginResponse.ok) {
        if (loginResponse.status === 404) {
          // Unlinked World ID
          setUnlinked(true);
          return;
        }
        const body = await loginResponse.json().catch(() => null);
        throw new Error(body?.detail || body?.error || 'World ID login failed.');
      }

      const { customToken } = await loginResponse.json();
      await signInWithCustomToken(auth, customToken);

      // After sign-in, complete login flow
      const user = auth.currentUser;
      if (user) await completeLogin(user);
    } catch (err: any) {
      setError(formatAuthError(err));
      setLoading(false);
    }
  };







/*
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!rpResponse.ok) {
        const errorData = await rpResponse.json().catch(() => null);
        throw new Error(errorData?.detail || errorData?.error || `RP context failed (${rpResponse.status})`);
      }
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

      // Send to login endpoint
      const loginResponse = await fetch('/api/auth/worldid/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idkitResponse: completion.result }),
      });

      if (!loginResponse.ok) {
        const body = await loginResponse.json().catch(() => null);
        throw new Error(body?.detail || body?.error || 'World ID login failed.');
      }

      const { customToken } = await loginResponse.json();
      await signInWithCustomToken(auth, customToken);

      // After sign-in, complete login flow
      const user = auth.currentUser;
      if (user) await completeLogin(user);
    } catch (err: any) {
      setError(formatAuthError(err));
      setLoading(false);
    }
  }; */

  const handleResendVerification = async () => {
    const user = auth.currentUser;
    if (user) {
      try {
        await sendEmailVerification(user);
        toast({ title: "Verification Email Sent", description: "Please check your inbox." });
      } catch (err: any) {
        setError("Failed to resend verification email. Please try again later.");
      }
    } else {
      setError("No user is currently signed in to resend verification for.");
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      toast({ variant: "destructive", title: "Email required", description: "Please enter your email address." });
      return;
    }
    setForgotLoading(true);
    try {
      // Try Firebase password reset first
      await sendPasswordResetEmail(auth, forgotEmail);
      toast({ title: "Reset Email Sent", description: "Check your inbox for the password reset link." });
      setForgotEmail('');
    } catch (err: any) {
      // If Firebase fails (e.g., operation-not-allowed), fall back to support assistant
      if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/configuration-not-found') {
        try {
          const response = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: forgotEmail }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to submit request');
          toast({ title: "Request Sent", description: "Our support team will contact you shortly to help recover your account." });
          setForgotEmail('');
        } catch (fallbackErr: any) {
          toast({ variant: "destructive", title: "Failed", description: fallbackErr.message });
        }
      } else {
        toast({ variant: "destructive", title: "Failed", description: formatAuthError(err) });
      }
    } finally {
      setForgotLoading(false);
    }
  };

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
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-primary hover:underline p-0 h-auto">
                    Forgot password?
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Recover Account Access</AlertDialogTitle>
                    <AlertDialogDescription>
                      Firebase password reset is disabled. Enter your email and our support team will contact you to help recover your account.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="grid gap-2 py-4">
                    <Label htmlFor="forgot-email">Email</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="m@example.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleForgotPassword} disabled={forgotLoading}>
                      {forgotLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Send Request'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Button variant="outline" className="w-full" onClick={handleGoogleLogin} disabled={loading}>
              <Chrome className="mr-2 h-4 w-4" />
              Continue with Google
            </Button>
            <Button variant="outline" className="w-full" onClick={handleWorldIdLogin} disabled={loading}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Continue with World ID
            </Button>
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <LoginForm />
    </Suspense>
  );
}