// src/lib/client/face-capture.ts
// Client-side facial capture utilities: MediaPipe face detection + frame compression.
// Kept client-only; imported lazily so the MediaPipe WASM bundle only loads when used.

import type { FaceDetector, FaceLandmarker, Matrix, Classifications, ImageSource } from "@mediapipe/tasks-vision";

const WASM_BASE = "/models/mediapipe";
const MODEL_URL = "/models/face-detector.tflite";
const MAX_CAPTURE_DIM = 480;
const JPEG_QUALITY = 0.72;

let detectorPromise: Promise<FaceDetector | null> | null = null;

async function getFaceDetector(): Promise<FaceDetector | null> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE);

        try {
          return await FaceDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
            runningMode: "IMAGE",
            minDetectionConfidence: 0.5,
          });
        } catch (gpuError) {
          console.warn("FaceDetector GPU delegate failed, falling back to CPU.", gpuError);
          return await FaceDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
            runningMode: "IMAGE",
            minDetectionConfidence: 0.5,
          });
        }
      } catch (error) {
        console.error("FaceDetector initialization failed:", error);
        return null;
      }
    })();
  }
  return detectorPromise;
}

/**
 * Counts the number of faces detected in the given image source.
 * Returns -1 if the face detector is unavailable (e.g. network/model failure),
 * so callers can decide to fail-open rather than block the user.
 */
export async function countFaces(source: ImageSource): Promise<number> {
  const detector = await getFaceDetector();
  if (!detector) return -1;

  try {
    const result = detector.detect(source);
    return result.detections?.length ?? 0;
  } catch (error) {
    console.error("Face detection error:", error);
    return -1;
  }
}

/**
 * Downscales a canvas/image to a maximum dimension and returns a compressed
 * JPEG data URI. Prevents storing huge base64 blobs and reduces AI payload size.
 */
export function downscaleCanvas(
  source: HTMLCanvasElement | HTMLImageElement,
  maxDim: number = MAX_CAPTURE_DIM,
  quality: number = JPEG_QUALITY
): string {
  const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d context");

  ctx.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export interface FaceCaptureResult {
  dataUri: string;
  faceCount: number;
}

/**
 * Draws the current video frame into the canvas, detects faces on it, and
 * returns a compressed JPEG data URI plus the number of faces found.
 */
export async function captureFaceFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): Promise<FaceCaptureResult> {
  const ctx = canvas.getContext("2d");
  if (!ctx || !video.videoWidth) throw new Error("Video not ready");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

  const faceCount = await countFaces(canvas);
  const dataUri = downscaleCanvas(canvas);
  return { dataUri, faceCount };
}

// ---------------------------------------------------------------------------
// Liveness / anti-spoofing (MediaPipe FaceLandmarker)
// ---------------------------------------------------------------------------

const LANDMARK_MODEL_URL = "/models/face_landmarker.task";
const LIVENESS_DURATION_MS = 2200;
const LIVENESS_FRAME_INTERVAL_MS = 110;
const LIVENESS_ANALYSIS_DIM = 256;
const MIN_SAMPLES_WITH_FACE = 0.6;
const BLINK_CLOSED_THRESHOLD = 0.6;
const HEAD_MOTION_DEG_THRESHOLD = 4;

let landmarkerPromise: Promise<FaceLandmarker | null> | null = null;

async function getFaceLandmarker(): Promise<FaceLandmarker | null> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      try {
        const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
        const landmarkerOptions = {
          runningMode: "VIDEO" as const,
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          minFaceDetectionConfidence: 0.5,
        };
        try {
          return await FaceLandmarker.createFromOptions(vision, {
            ...landmarkerOptions,
            baseOptions: { modelAssetPath: LANDMARK_MODEL_URL, delegate: "GPU" },
          });
        } catch (gpuError) {
          console.warn("FaceLandmarker GPU delegate failed, falling back to CPU.", gpuError);
          return await FaceLandmarker.createFromOptions(vision, {
            ...landmarkerOptions,
            baseOptions: { modelAssetPath: LANDMARK_MODEL_URL, delegate: "CPU" },
          });
        }
      } catch (error) {
        console.error("FaceLandmarker initialization failed:", error);
        return null;
      }
    })();
  }
  return landmarkerPromise;
}

const RAD_TO_DEG = 180 / Math.PI;

export interface HeadPose {
  pitchDeg: number;
  yawDeg: number;
  rollDeg: number;
}

/**
 * Extracts approximate Euler angles (pitch/yaw/roll) from a MediaPipe facial
 * transformation matrix (3x4, row-major). Used to detect natural head motion,
 * which a static printed photo cannot produce.
 */
export function headPoseFromTransform(matrix: Matrix | undefined): HeadPose | null {
  if (!matrix || matrix.data.length < 12) return null;
  const d = matrix.data;
  const r00 = d[0], r01 = d[1], r02 = d[2];
  const r10 = d[4], r11 = d[5], r12 = d[6];
  const r20 = d[8], r21 = d[9], r22 = d[10];
  const pitchDeg = Math.asin(Math.max(-1, Math.min(1, -r20))) * RAD_TO_DEG;
  const yawDeg = Math.atan2(r10, r00) * RAD_TO_DEG;
  const rollDeg = Math.atan2(r21, r22) * RAD_TO_DEG;
  return { pitchDeg, yawDeg, rollDeg };
}

function blendshapeScore(blendshapes: Classifications[], name: string): number {
  for (const classification of blendshapes) {
    for (const category of classification.categories) {
      if (category.categoryName === name) return category.score;
    }
  }
  return 0;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface LivenessResult {
  isLive: boolean;
  reason: string;
  blinks: number;
  headMotionDeg: number;
  frames: string[];
}

/** `"unavailable"` means the landmark model could not be loaded; fail open. */
export type LivenessOutcome = LivenessResult | "unavailable";

/**
 * Samples the camera for ~2.2s while the user looks at the lens. Verifies the
 * face stays visible, and either a blink or significant 3D head motion occurs
 * (both impossible for a static printed photo). Returns a few compressed frames
 * from across the sequence for identity comparison.
 */
export async function captureLiveSequence(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  opts?: { durationMs?: number; intervalMs?: number; framesToKeep?: number }
): Promise<LivenessOutcome> {
  const landmarker = await getFaceLandmarker();
  if (!landmarker) return "unavailable";

  const durationMs = opts?.durationMs ?? LIVENESS_DURATION_MS;
  const intervalMs = opts?.intervalMs ?? LIVENESS_FRAME_INTERVAL_MS;
  const framesToKeep = opts?.framesToKeep ?? 3;
  const ctx = canvas.getContext("2d");
  if (!ctx || !video.videoWidth) return "unavailable";

  // Analyze a small downscaled copy of the frame: the landmark model dominates
  // per-frame cost, and on low-end devices (iPhone 7 / A10) its full-resolution
  // input drops the sampling rate or janks the UI. 256px preserves blink and
  // head-pose accuracy while being ~4-16x cheaper.
  const analysisCanvas = document.createElement("canvas");
  const analysisScale = Math.min(1, LIVENESS_ANALYSIS_DIM / Math.max(video.videoWidth, video.videoHeight));
  analysisCanvas.width = Math.max(1, Math.round(video.videoWidth * analysisScale));
  analysisCanvas.height = Math.max(1, Math.round(video.videoHeight * analysisScale));
  const analysisCtx = analysisCanvas.getContext("2d");
  if (!analysisCtx) return "unavailable";

  const keepRatios: number[] = [];
  for (let i = 0; i < framesToKeep; i++) keepRatios.push((i + 0.5) / framesToKeep);
  let keepNext = 0;

  const hasFace: boolean[] = [];
  const eyeClosed: boolean[] = [];
  const poses: HeadPose[] = [];
  const frames: string[] = [];

  const startTime = performance.now();
  const GLOBAL_TIMEOUT_MS = Math.max(durationMs + 3000, 8000);
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    console.warn("Liveness sequence timed out globally");
  }, GLOBAL_TIMEOUT_MS);

  // Ensure video is playing
  if (video.readyState < 2) {
    try {
      await new Promise<void>((resolve) => {
        const onPlaying = () => {
          video.removeEventListener("playing", onPlaying);
          resolve();
        };
        video.addEventListener("playing", onPlaying, { once: true });
      });
    } catch (e) {
      // ignore
    }
  }
  // small stability delay
  await sleep(120);

  try {
    let attempts = 0;
    const maxAttemptsBeforeFailFast = 2;
    while (true) {
      if (timedOut) break;
      const sampleStart = performance.now();
      try {
        analysisCtx.drawImage(video, 0, 0, analysisCanvas.width, analysisCanvas.height);
        const ts = sampleStart;
        let res: any;
        try {
          res = landmarker.detectForVideo(analysisCanvas as any, ts);
          attempts = 0; // reset on success
        } catch (e) {
          attempts++;
          console.error(`detectForVideo threw (attempt ${attempts}):`, e);
          if (attempts >= maxAttemptsBeforeFailFast) {
            timedOut = true;
            break;
          }
          await sleep(100);
          continue;
        }
        const facePresent = res?.faceLandmarks?.length > 0;
        hasFace.push(facePresent);

        if (facePresent) {
          const blinkLeft = blendshapeScore(res.faceBlendshapes ?? [], "eyeBlinkLeft");
          const blinkRight = blendshapeScore(res.faceBlendshapes ?? [], "eyeBlinkRight");
          eyeClosed.push(Math.max(blinkLeft, blinkRight) >= BLINK_CLOSED_THRESHOLD);
          poses.push(headPoseFromTransform(res.facialTransformationMatrixes?.[0]) ?? { pitchDeg: 0, yawDeg: 0, rollDeg: 0 });

          const progress = (sampleStart - startTime) / durationMs;
          if (keepNext < keepRatios.length && progress >= keepRatios[keepNext]) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames.push(downscaleCanvas(canvas));
            keepNext++;
          }
        }
      } catch (err) {
        console.error("detectForVideo error:", err);
        timedOut = true;
        break;
      }

      const elapsed = performance.now() - startTime;
      if (elapsed >= durationMs) break;
      const nextAt = sampleStart + intervalMs;
      const sleepMs = Math.max(16, nextAt - performance.now());
      if (sleepMs > 0) {
        await sleep(sleepMs);
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }

  // Only evaluate blink transitions on frames where a face was present.
  const closedStates = hasFace.map((present, i) => present && eyeClosed[i] === true);
  let blinks = 0;
  let wasClosed = false;
  for (const closedNow of closedStates) {
    if (closedNow && !wasClosed) blinks++;
    wasClosed = closedNow;
  }

  const pitches = poses.map((p) => p.pitchDeg);
  const yaws = poses.map((p) => p.yawDeg);
  const rolls = poses.map((p) => p.rollDeg);
  const range = (arr: number[]) => (arr.length ? Math.max(...arr) - Math.min(...arr) : 0);
  const headMotionDeg = Math.max(range(pitches), range(yaws), range(rolls));

  const presenceRatio = hasFace.filter(Boolean).length / Math.max(1, hasFace.length);

  let isLive = false;
  let reason = "No natural motion detected. Look at the camera and blink.";
  if (presenceRatio < MIN_SAMPLES_WITH_FACE) {
    reason = "Keep your face fully visible for the whole check.";
  } else if (blinks >= 1) {
    isLive = true;
    reason = `Blink detected (${blinks}).`;
  } else if (headMotionDeg >= HEAD_MOTION_DEG_THRESHOLD) {
    isLive = true;
    reason = `Natural head movement detected (${headMotionDeg.toFixed(1)}°).`;
  }

  return { isLive, reason, blinks, headMotionDeg: Math.round(headMotionDeg * 10) / 10, frames };
}