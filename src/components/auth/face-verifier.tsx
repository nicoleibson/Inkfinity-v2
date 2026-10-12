// src/components/auth/face-verifier.tsx
"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Camera, ShieldCheck, ShieldX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { VerifyFaceOutput } from '@/ai/schemas/verify-face-schema';
import { auth, database } from '@/lib/firebase-config';
import { onAuthStateChanged } from 'firebase/auth';
import { captureFaceFrame, captureLiveSequence, preloadFaceLandmarker } from '@/lib/client/face-capture';
import { requestCamera, cameraErrorTitle, cameraErrorDescription } from '@/lib/client/camera';
import type { CameraDiagnostics } from '@/lib/client/camera';
import { getVerificationLock, registerVerificationFailure, resetVerificationFailures, formatRetryTime } from '@/lib/face-lock';
import { sendEmailFallbackLink } from '@/lib/email-fallback';

import { get, ref } from 'firebase/database';
import type { UserProfile } from '@/types/user';

interface FaceVerifierProps {
  onVerificationSuccess: () => void;
  onVerificationFail?: () => void;
}

export function FaceVerifier({ onVerificationSuccess, onVerificationFail }: FaceVerifierProps) {
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<CameraDiagnostics | null>(null);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isProcessingFace, setIsProcessingFace] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerifyFaceOutput | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();
  const [profile, setProfile] = useState<Partial<UserProfile>>({});

  const stopCamera = useCallback(() => {
    const currentStream = streamRef.current;
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (streamRef.current) {
      return;
    }
    setIsStartingCamera(true);
    const result = await requestCamera();
    setIsStartingCamera(false);
    if (result.ok) {
      streamRef.current = result.stream;
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
  }, [toast]);

  const retryCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    setHasCameraPermission(null);
    await startCamera();
  }, [stopCamera, startCamera]);

  useEffect(() => {
    // Warm the liveness model while the user positions their face so the
    // one-time WASM/model download does not trigger the liveness timeout.
    preloadFaceLandmarker();
    startCamera();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = ref(database, `users/${user.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          setProfile(snapshot.val());
        }
      }
    });
    return () => {
      stopCamera();
      unsubscribe();
    };
  }, [startCamera, stopCamera]);

  const captureAndProcessFace = async () => {
    if (!videoRef.current || !auth.currentUser) return;
    const uid = auth.currentUser.uid;

    const lock = await getVerificationLock(uid);
    if (!lock.allowed) {
      toast({ variant: 'destructive', title: 'Too Many Attempts', description: `Try again in ${formatRetryTime(lock.retryAfterMs)}, or use the email link below.` });
      return;
    }

    setIsProcessingFace(true);
    setVerificationResult(null);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (canvas && video) {
      try {
        const frame = await captureFaceFrame(video, canvas);

        if (frame.faceCount === 0) {
          toast({ variant: 'destructive', title: 'No Face Detected', description: 'A face must be clearly visible in the frame to verify your identity.' });
          setIsProcessingFace(false);
          stopCamera();
          return;
        }
        if (frame.faceCount > 1) {
          toast({ variant: 'destructive', title: 'Multiple Faces Detected', description: 'Only one person should be in the frame during verification.' });
          setIsProcessingFace(false);
          stopCamera();
          return;
        }

        if (!profile.facialScanUrl) {
          toast({ variant: 'destructive', title: 'No Face Registered', description: 'Cannot verify identity.' });
          setIsProcessingFace(false);
          stopCamera();
          return;
        }

        // Liveness gate: verify a live person (blink or head motion) over ~2s.
        // Generous safety net: on a cold load the landmarker WASM/model init can
        // take a while, and aborting early degrades liveness to "unavailable".
        const LIVENESS_SAFETY_TIMEOUT_MS = 15000;
        let liveness: "unavailable" | Awaited<ReturnType<typeof captureLiveSequence>> = "unavailable";
        try {
          console.log("Starting liveness check...");
          let timeoutId: NodeJS.Timeout | null = null;
          liveness = await Promise.race([
            captureLiveSequence(video, canvas).finally(() => {
              if (timeoutId) clearTimeout(timeoutId);
            }),
            new Promise<"unavailable">((resolve) => {
              timeoutId = setTimeout(() => {
                console.warn(`Liveness check timed out after ${LIVENESS_SAFETY_TIMEOUT_MS}ms, falling back to unavailable`);
                resolve("unavailable");
              }, LIVENESS_SAFETY_TIMEOUT_MS);
            }),
          ]);
          console.log("Liveness check completed:", liveness);
        } catch (e) {
          console.error("Liveness check threw error:", e);
          liveness = "unavailable";
        }
        let liveDataUri = frame.dataUri;
        if (liveness !== "unavailable") {
          if (!liveness.isLive) {
            await registerVerificationFailure(uid);
            toast({ variant: 'destructive', title: 'Liveness Check Failed', description: liveness.reason });
            setIsProcessingFace(false);
            stopCamera();
            return;
          }
          if (liveness.frames.length > 0) liveDataUri = liveness.frames[0];
        } else {
          console.warn("Liveness model unavailable, skipping liveness check.");
        }

        console.log("Building frames from liveness:", liveness);
        let primaryFrame = frame.dataUri;
        let frame2 = frame.dataUri;
        let frame3 = frame.dataUri;

        if (liveness !== "unavailable" && liveness.frames && liveness.frames.length >= 3) {
          primaryFrame = liveness.frames[0];
          frame2 = liveness.frames[1];
          frame3 = liveness.frames[2];
        } else {
          // If liveness landmarker was unavailable or returned fewer frames, capture discrete
          // frames spaced ~300ms apart from the live video stream to satisfy anti-spoofing requirements.
          if (liveness !== "unavailable" && liveness.frames && liveness.frames.length > 0) {
            primaryFrame = liveness.frames[0];
          }
          await new Promise((r) => setTimeout(r, 300));
          const cap2 = await captureFaceFrame(video, canvas);
          if (cap2.faceCount === 1) frame2 = cap2.dataUri;
          await new Promise((r) => setTimeout(r, 300));
          const cap3 = await captureFaceFrame(video, canvas);
          if (cap3.faceCount === 1) frame3 = cap3.dataUri;
        }
        console.log("Frames prepared, calling API...");

        // The server re-runs the comparison against the registered scan stored in the
        // database and is the only party that decides whether to grant the session.
        const grantResponse = await fetch('/api/auth/face-verified', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frame1: primaryFrame, frame2, frame3 }),
        });

        const grant = (await grantResponse.json().catch((e) => {
          console.error("Failed to parse grant response:", e);
          return {};
        })) as {
          success?: boolean;
          confidence?: number;
          reason?: string;
          error?: string;
          isMatch?: boolean;
        };
        console.log("Face verification API response:", { status: grantResponse.status, ok: grantResponse.ok, grant: JSON.stringify(grant) });

        const confidence = grant.confidence ?? 0;
        const confidencePercent = Math.round(confidence * 100);
        setVerificationResult({
          isMatch: grant.success === true || grant.isMatch === true,
          confidence,
          reason: grant.reason ?? grant.error ?? 'Verification could not be completed.',
        });

        if (grantResponse.ok && (grant.success === true || grant.isMatch === true)) {
            await resetVerificationFailures(uid);
            toast({
                title: 'Verification Successful',
                description: `${grant.reason ?? 'Identity confirmed.'} (confidence ${confidencePercent}%).`,
            });
            onVerificationSuccess();
        } else {
            await registerVerificationFailure(uid);
            toast({
                variant: 'destructive',
                title: `Verification Failed (${grantResponse.status})`,
                description: `${grant.reason ?? grant.error ?? 'Identity could not be confirmed.'}${grantResponse.status === 403 ? ' An active membership is required.' : ''}${grantResponse.status === 401 ? ' (confidence may be below threshold or no match)' : ''}${grantResponse.status === 502 ? ' (infrastructure/model error)' : ''}`,
            });
            onVerificationFail?.();
        }

      } catch (error) {
        console.error(`Verification error:`, error);
        await registerVerificationFailure(uid);
        toast({
          variant: 'destructive',
          title: `Verification Error`,
          description: `An unexpected error occurred during face verification.`,
        });
        onVerificationFail?.();
      } finally {
        setIsProcessingFace(false);
        stopCamera(); // Deactivate camera after verification attempt
      }
    }
  };

  const [isSendingEmailLink, setIsSendingEmailLink] = useState(false);

  const handleSendEmailLink = async () => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const email = auth.currentUser.email;
    if (!email) {
      toast({ variant: 'destructive', title: 'No Email Found', description: 'Your account has no email address on file.' });
      return;
    }

    const lock = await getVerificationLock(uid);
    if (!lock.allowed) {
      toast({ variant: 'destructive', title: 'Too Many Attempts', description: `Try again in ${formatRetryTime(lock.retryAfterMs)}.` });
      return;
    }

    setIsSendingEmailLink(true);
    try {
      await sendEmailFallbackLink(auth, email);
      toast({ title: 'Email Sent', description: 'Click the secure link we just emailed you to continue.' });
    } catch (error) {
      console.error('Send email link error:', error);
      toast({ variant: 'destructive', title: 'Email Error', description: 'Could not send the email link. Please try again.' });
    } finally {
      setIsSendingEmailLink(false);
    }
  };

  return (
    <div className="space-y-4">
      {hasCameraPermission === false && (
        <Alert variant="destructive">
          <Camera className="h-4 w-4" />
          <AlertTitle>{cameraError ? cameraErrorTitle(cameraError.error) : 'Camera Access Required'}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            {cameraError ? cameraErrorDescription(cameraError.error) : 'Please allow camera access in your browser to use this feature.'}
            <Button onClick={retryCamera} disabled={isStartingCamera} variant="outline" size="sm" className="self-start">
              {isStartingCamera ? <Loader2 className="animate-spin mr-2" /> : null}
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="relative aspect-video w-full max-w-sm mx-auto bg-muted rounded-md overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
      </div>
      
      {hasCameraPermission === true && !profile.facialScanUrl && (
        <Alert variant="destructive">
          <AlertTitle>No Face Registered</AlertTitle>
          <AlertDescription>It looks like you haven't registered a facial scan yet. You can <a href="/settings" className="underline">register one in settings</a>, or use the email verification link below.
          </AlertDescription>
        </Alert>
      )}
      
      <div className="flex flex-col sm:flex-row gap-2">
        <Button onClick={captureAndProcessFace} disabled={!hasCameraPermission || isProcessingFace || !profile.facialScanUrl || !streamRef.current} className="w-full">
          {isProcessingFace ? <Loader2 className="animate-spin mr-2" /> : <Camera className="mr-2"/>}
          {isProcessingFace ? "Verifying..." : "Verify Identity"}
        </Button>
      </div>

      {verificationResult && !verificationResult.isMatch && (
        <Alert variant="destructive" className="flex items-center gap-4">
           <ShieldX className="h-5 w-5" />
          <div>
            <AlertTitle>Verification Failed</AlertTitle>
            <AlertDescription>{verificationResult.reason}</AlertDescription>
          </div>
        </Alert>
      )}

      <div className="border-t pt-4">
        <p className="text-sm font-medium">Camera not working?</p>
        <p className="text-sm text-muted-foreground mb-2">
          We can email you a secure one-time link instead. Click it to verify your identity without the camera.
        </p>
        <Button onClick={handleSendEmailLink} disabled={isSendingEmailLink} variant="secondary" className="w-full">
          {isSendingEmailLink ? <Loader2 className="animate-spin mr-2" /> : null}
          Email me a secure link
        </Button>
      </div>
    </div>
  );
}
