// src/app/verify-face/email-link/page.tsx
"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase-config';
import { signInWithEmailLink } from 'firebase/auth';
import { getPendingEmail, getEmailFromLink, clearPendingEmail } from '@/lib/email-fallback';
import { resetVerificationFailures } from '@/lib/face-lock';
import { Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function EmailLinkPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'verifying' | 'verified' | 'error'>('verifying');
  const [error, setError] = useState('');

  useEffect(() => {
    const completeEmailLink = async () => {
      // Same-browser flow keeps the email in localStorage; the link URL carries
      // it too, so opening the link on another device still resolves.
      const email = getPendingEmail() ?? getEmailFromLink(window.location.href);
      if (!email) {
        setStatus('error');
        setError('No pending email was found. Request a new link from the verification page.');
        return;
      }

      try {
        const credential = await signInWithEmailLink(auth, email, window.location.href);
        await resetVerificationFailures(credential.user.uid);
        clearPendingEmail();
        setStatus('verified');
        setTimeout(() => router.replace('/'), 1500);
      } catch (err: unknown) {
        console.error('Email link verification error:', err);
        clearPendingEmail();
        setStatus('error');
        setError(err instanceof Error ? err.message : 'The link is invalid or expired.');
      }
    };

    completeEmailLink();
  }, [router]);

  return (
    <div className="flex min-h-full flex-1 flex-col justify-center items-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-headline text-2xl">Email Link Verification</CardTitle>
          <CardDescription>
            Confirming your identity through the secure link sent to your inbox.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {status === 'verifying' && (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Verifying link...</p>
            </div>
          )}

          {status === 'verified' && (
            <div className="flex flex-col items-center gap-2">
              <ShieldCheck className="h-8 w-8 text-green-500" />
              <p>Identity verified. Redirecting...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-4">
              <ShieldX className="h-8 w-8 text-red-500" />
              <p className="text-destructive break-words">{error}</p>
              <Button onClick={() => router.replace('/verify-face')}>
                Back to Verification
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}