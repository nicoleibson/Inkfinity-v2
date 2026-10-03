'use client';

import { useState } from 'react';
import { auth } from '@/lib/firebase-config';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle2, Fingerprint, Loader2, ShieldCheck } from 'lucide-react';

/**
 * Links a World ID to the signed-in account.
 *
 * The browser never decides anything: it obtains an RP signature from the
 * backend, asks IDKit for a proof, and forwards the IDKit result to
 * `/api/worldid/verify`. Only that server route turns a proof into the
 * `worldIdVerified` flag, using the uid from the session token.
 */
export default function WorldIdVerification({ verified, verifiedAt }: { verified?: boolean; verifiedAt?: string }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const handleVerify = async () => {
    const user = auth.currentUser;
    if (!user) {
      toast({ variant: 'destructive', title: 'Sign in required' });
      return;
    }

    setBusy(true);
    try {
      const token = await user.getIdToken();

      const rpResponse = await fetch('/api/worldid/rp-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!rpResponse.ok) throw new Error(`rp-context failed (${rpResponse.status})`);
      const rp = await rpResponse.json();

      const { IDKit, orbLegacy } = await import('@worldcoin/idkit');

      const appId = process.env.NEXT_PUBLIC_WORLD_APP_ID || '';
      if (!appId.startsWith('app_')) {
        throw new Error('World ID is not configured for this deployment.');
      }

      const request = await IDKit.request({
        app_id: appId as `app_${string}`,
        action: 'inkfinity-account',
        rp_context: {
          rp_id: rp.rp_id,
          nonce: rp.nonce,
          created_at: rp.created_at,
          expires_at: rp.expires_at,
          signature: rp.signature,
        },
        allow_legacy_proofs: true,
        environment: 'production',
      }).preset(orbLegacy());

      const completion = await request.pollUntilCompletion({ timeout: 120000 });
      if (!completion.success) {
        throw new Error(completion.error || 'Verification was not completed.');
      }

      const verifyResponse = await fetch('/api/worldid/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ idkitResponse: completion.result }),
      });

      if (!verifyResponse.ok) {
        const body = await verifyResponse.json().catch(() => null);
        // 503 means we could not check, not that the person is a bot: never
        // tell the user their proof was rejected when the verifier was down.
        throw new Error(
          body?.error === 'WORLDID_UNAVAILABLE'
            ? 'World ID verification is temporarily unavailable. Try again later.'
            : body?.detail || 'Verification failed.',
        );
      }

      toast({ title: 'World ID Verified', description: 'Your account now proves your humanity.' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Verification Failed',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div>
          <h3 className="text-md font-medium flex items-center gap-2">
            <Fingerprint className="h-5 w-5" />
            Proof of Humanity
          </h3>
          {verified ? (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              World ID verified
              {verifiedAt && (
                <span className="text-xs">on {new Date(verifiedAt).toLocaleDateString()}</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              Verify with World ID to prove you are human without sharing any personal data.
            </p>
          )}
        </div>
        <Button variant="outline" onClick={handleVerify} disabled={busy || verified}>
          {busy ? <Loader2 className="animate-spin" /> : verified ? <CheckCircle2 /> : <ShieldCheck />}
          {verified ? 'Verified' : 'Verify with World ID'}
        </Button>
      </div>
    </Card>
  );
}