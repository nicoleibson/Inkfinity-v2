// src/components/auth/face-verifier.tsx
"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Camera, ShieldCheck, ShieldX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { verifyFace } from '@/ai/flows/verify-face-flow';
import type { VerifyFaceOutput } from '@/ai/schemas/verify-face-schema';
import { auth, database } from '@/lib/firebase-config';
import { captureFaceFrame, captureLiveSequence } from '@/lib/client/face-capture';
import { requestCamera, cameraErrorTitle, cameraErrorDescription } from '@/lib/client/camera';
import type { CameraDiagnostics } from '@/lib/client/camera';
import { getVerificationLock, registerVerificationFailure, resetVerificationFailures, formatRetryTime } from '@/lib/face-lock';
import { sendEmailFallbackLink } from '@/lib/email-fallback';

const FACE_CONFIDENCE_THRESHOLD = 0.8;
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
    startCamera();
    
    return () => {
      stopCamera();
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
        const liveness = await captureLiveSequence(video, canvas);
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
            await resetVerificationFailures(uid);
            toast({
                title: 'Verification Successful',
                description: `${result.reason} (confidence ${confidencePercent}%).`,
            });
            // Record face verification in custom claims
            try {
              await fetch('/api/auth/face-verified', {
                method: 'POST',
                credentials: 'include',
              });
            } catch (e) {
              console.warn('Failed to record face verification claim:', e);
            }
            onVerificationSuccess();
        } else {
            await registerVerificationFailure(uid);
            toast({
                variant: 'destructive',
                title: 'Verification Failed',
                description: `${result.reason} (confidence ${confidencePercent}%).`,
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
