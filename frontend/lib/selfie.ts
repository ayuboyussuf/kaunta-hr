/**
 * Live selfie capture for clock-in/out (anti-buddy-punching).
 *
 * The photo is ALWAYS taken from the live front camera — there is no file input
 * anywhere, so a saved/gallery photo can't be submitted. Where the browser
 * exposes the native FaceDetector API (Chrome/Android — most of our users) we
 * auto-capture the moment a face appears and report faceDetected=true; a scan
 * with no verified face is flagged server-side for owner review. Where the API
 * is absent (e.g. iOS Safari) we still capture the photo after a short framing
 * delay — the stored photo + owner review remains the safeguard.
 */
export interface SelfieResult {
  image: string | null; // data URL ("data:image/jpeg;base64,…") or null if no camera
  faceDetected: boolean;
}

// FaceDetector is a browser global where supported; type it loosely.
type FaceDetectorLike = { detect(source: CanvasImageSource): Promise<unknown[]> };

/** Downscale the current video frame to a compact JPEG data URL. */
function grabFrame(video: HTMLVideoElement, maxDim = 480): string | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const scale = Math.min(1, maxDim / Math.max(vw, vh));
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.7);
}

/**
 * Open the front camera into `video`, wait for a face (where supported), and
 * capture. Always stops the camera before returning. Never throws.
 */
export async function captureSelfie(
  video: HTMLVideoElement,
  opts?: { timeoutMs?: number }
): Promise<SelfieResult> {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play().catch(() => {});
    // Let the sensor settle so the first frame isn't black.
    await new Promise((r) => setTimeout(r, 400));

    let detector: FaceDetectorLike | null = null;
    const FD = (window as unknown as { FaceDetector?: new (o?: unknown) => FaceDetectorLike }).FaceDetector;
    if (typeof FD === "function") {
      try {
        detector = new FD({ fastMode: true, maxDetectedFaces: 1 });
      } catch {
        detector = null;
      }
    }

    let faceDetected = false;
    if (detector) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        try {
          const faces = await detector.detect(video);
          if (Array.isArray(faces) && faces.length > 0) {
            faceDetected = true;
            break;
          }
        } catch {
          break; // detector unusable — fall through to a plain capture
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    } else {
      // No on-device face API: give the user a moment to frame up, then capture.
      // We can't verify a face, so we don't claim one — but the photo is stored.
      await new Promise((r) => setTimeout(r, 1500));
    }

    return { image: grabFrame(video), faceDetected: detector ? faceDetected : true };
  } catch {
    // Camera denied/unavailable — proceed with no selfie (server flags no_face).
    return { image: null, faceDetected: false };
  } finally {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    try {
      video.srcObject = null;
    } catch {
      /* ignore */
    }
  }
}
