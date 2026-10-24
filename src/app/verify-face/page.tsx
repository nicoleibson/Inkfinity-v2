// src/app/verify-face/page.tsx
"use client";

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth } from '@/lib/firebase-config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { FaceVerifier } from '@/components/auth/face-verifier';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Suspense } from 'react';

function VerifyFaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const redirect = searchParams.get('redirect') || '/';
  const expired = searchParams.get('expired') === 'true';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsAuthenticated(true);
        // Ensure session cookie is set so face-verified API can authenticate (no bloquear UI).
        (async () => {
          try {
            const idToken = await user.getIdToken();
            await fetch('/api/auth/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken }),
              signal: AbortSignal.timeout(10000),
            });
          } catch (e) {
            console.warn('Failed to set session cookie:', e);
          }
        })();
      } else {
        router.push('/login');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const onVerificationSuccess = () => {
    // Refresh ID token to get new custom claims, then update session cookie
    auth.currentUser?.getIdToken(true).then(async (idToken) => {
      try {
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
          signal: AbortSignal.timeout(10000),
        });
      } catch (e) {
        console.warn('Failed to update session cookie:', e);
      }
      router.push(redirect);
    }).catch(() => {
      router.push(redirect);
    });
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-1 flex-col justify-center items-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col justify-center items-center">
        <Card className="w-full max-w-md border-primary/20">
            <CardHeader>
                <CardTitle className="font-headline text-2xl">Verify Your Identity</CardTitle>
                <CardDescription>
                    {expired 
                      ? 'Your facial verification has expired. Please verify again to continue.' 
                      : 'For enhanced security, please complete this facial scan to continue.'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <FaceVerifier onVerificationSuccess={onVerificationSuccess} />
            </CardContent>
            <CardFooter className="flex justify-center">
                <Button variant="link" onClick={handleLogout}>
                    Cancel and Log Out
                </Button>
            </CardFooter>
        </Card>
    </div>
  );
}

export default function VerifyFacePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-1 flex-col justify-center items-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    }>
      <VerifyFaceContent />
    </Suspense>
  );
}