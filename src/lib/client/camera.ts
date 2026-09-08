// src/lib/client/camera.ts
// Shared camera access with actionable diagnostics. Distinguishes the common
// reasons a `getUserMedia` call fails so we can guide the user instead of
// showing a raw browser error like "requested device not found".

export type CameraError = "unsupported" | "no-device" | "denied" | "in-use" | "unknown";

export interface CameraDiagnostics {
  error: CameraError;
  /** Raw browser error name, e.g. "NotFoundError". */
  name: string;
  /** Raw browser error message. */
  message: string;
  /** Whether navigator.mediaDevices was available (requires HTTPS/localhost). */
  mediaDevicesAvailable: boolean;
  /** Number of videoinput devices enumerated (0 when enumeration failed). */
  videoInputCount: number;
}

export type CameraRequestResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; diagnostics: CameraDiagnostics };

export function cameraErrorTitle(error: CameraError): string {
  switch (error) {
    case "unsupported":
      return "Camera Not Supported Here";
    case "no-device":
      return "No Camera Device Found";
    case "denied":
      return "Camera Permission Denied";
    case "in-use":
      return "Camera Already In Use";
    default:
      return "Camera Access Failed";
  }
}

export function cameraErrorDescription(error: CameraError): string {
  switch (error) {
    case "unsupported":
      return "This page must be opened over HTTPS (or localhost) for camera access. On iPhone/iPad use the published HTTPS site, not an IP address over HTTP.";
    case "no-device":
      return "No camera device was detected. Check the camera physically and your system privacy settings (macOS/Windows camera permission for the browser).";
    case "denied":
      return "Camera permission was denied by the browser or the system. Allow camera access in the site settings and in the OS privacy settings, then reload this page.";
    case "in-use":
      return "The camera is being used by another application (e.g. a video call). Close it and try again.";
    default:
      return "Could not access the camera. Enable HTTPS and camera permissions, then try again.";
  }
}

/** Basic constraints used after richer constraints fail (e.g. OverconstrainedError). */
const BASIC_VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: "user" },
  audio: false,
};

export async function enumerateVideoInputs(): Promise<number> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "videoinput").length;
  } catch (error) {
    console.warn("enumerateDevices failed:", error);
    return 0;
  }
}

function classifyError(error: unknown): CameraError {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return "denied";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "no-device";
  }
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return "in-use";
  }
  return "unknown";
}

export async function requestCamera(): Promise<CameraRequestResult> {
  const mediaDevicesAvailable = !!navigator.mediaDevices?.getUserMedia;

  if (!mediaDevicesAvailable) {
    return {
      ok: false,
      diagnostics: {
        error: "unsupported",
        name: "",
        message: "navigator.mediaDevices unavailable (insecure context or unsupported browser).",
        mediaDevicesAvailable: false,
        videoInputCount: 0,
      },
    };
  }

  // IMPORTANT: call getUserMedia FIRST. On iOS Safari / some desktop browsers,
  // enumerateDevices() returns an empty list until camera permission is granted,
  // so a "no devices" pre-check would block the permission prompt itself.
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    return { ok: true, stream };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";

    // Older devices (e.g. iPhone 7, low-end webcams) can fail the full
    // constraints with OverconstrainedError. Retry with minimal constraints
    // before concluding there is no usable camera.
    if (name === "OverconstrainedError") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(BASIC_VIDEO_CONSTRAINTS);
        return { ok: true, stream };
      } catch (retryError) {
        return {
          ok: false,
          diagnostics: {
            error: classifyError(retryError),
            name: retryError instanceof Error ? retryError.name : name,
            message: retryError instanceof Error ? retryError.message : String(error),
            mediaDevicesAvailable: true,
            videoInputCount: await enumerateVideoInputs(),
          },
        };
      }
    }

    const videoInputCount = await enumerateVideoInputs();

    // An ambiguous failure on a browser that usually has a camera, where
    // enumeration still lists nothing, is far more likely a permission /
    // secure-context issue than a genuinely missing device (iOS quirk).
    let cameraError = classifyError(error);
    if (cameraError === "unknown" && videoInputCount === 0) {
      cameraError = "denied";
    }

    return {
      ok: false,
      diagnostics: { error: cameraError, name, message: error instanceof Error ? error.message : String(error), mediaDevicesAvailable: true, videoInputCount },
    };
  }
}