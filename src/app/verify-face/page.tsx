// src/app/verify-face/page.tsx
"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase-config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { FaceVerifier } from '@/components/auth/face-verifier';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function VerifyFacePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthenticated(true);
      } else {
        router.push('/login');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const onVerificationSuccess = () => {
    router.push('/');
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  if (loading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-1 flex-col justify-center items-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col justify-center items-center">
        <Card className="w-full max-w-md border-primary/20">
            <CardHeader>
                <CardTitle className="font-headline text-2xl">Verify Your Identity</CardTitle>
                <CardDescription>
                    For enhanced security, please complete this facial scan to continue.
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
