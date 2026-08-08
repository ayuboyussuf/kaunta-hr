"use client";

/**
 * Camera QR scanner + geolocation clock-in, shared by /me/clock-in (in-dashboard)
 * and /scan (deep-link fallback). On a successful decode it reads the device GPS
 * and POSTs { token, lat, lng, accuracy } to the backend, which stamps the time
 * server-side and returns the assigned status.
 */
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { api, getEmployeeToken, NetworkError } from "@/lib/api";
import { captureSelfie } from "@/lib/selfie";
import { flushScanFailures, reportScanFailure } from "@/lib/scanAttempts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Phase = "scanning" | "selfie" | "locating" | "sending" | "done" | "error";

interface ScanResult {
  status: "normal" | "late" | "flagged" | "on_leave";
  direction: "in" | "out" | "check";
  presence_check: { confirmed: boolean; location_verified: boolean | null } | null;
  distance_m: number | null;
  flags: string[];
  workplace: { name: string };
  on_leave: { id: string; start_date: string; end_date: string } | null;
  penalty: { id: string; reason: string; amount: number } | null;
}

const STATUS_COPY: Record<string, { title: string; tone: string; note: string }> = {
  normal: { title: "Clocked in — on time", tone: "text-aproksi-sage", note: "You're inside the workplace area." },
  late: { title: "Clocked in — late", tone: "text-aproksi-amber", note: "Recorded as late against your shift." },
  flagged: { title: "Clocked in — flagged", tone: "text-aproksi-red", note: "This scan was flagged for review." },
  on_leave: {
    title: "Clocked in — approved leave",
    tone: "text-aproksi-ultra",
    note: "Today is leave your employer approved. You are not marked late and there is no penalty.",
  },
  out: { title: "Clocked out", tone: "text-aproksi-sage", note: "Your clock-out has been recorded." },
  /* Answering a check is not leaving. Reporting "Clocked out" here is how
     somebody concludes the app has just ended their shift by mistake. */
  check: {
    title: "Presence confirmed",
    tone: "text-aproksi-sage",
    note: "You answered the check. You are still clocked in — this did not end your shift.",
  },
};

const SCANNER_ID = "aproksi-qr-reader";

/** The printed QR encodes a `…/scan?w=<token>` deep link; accept that or a raw token. */
function extractToken(decoded: string): string {
  try {
    const url = new URL(decoded);
    return url.searchParams.get("w") ?? decoded;
  } catch {
    return decoded;
  }
}

export default function ClockInScanner({ presetToken }: { presetToken?: string }) {
  const [phase, setPhase] = useState<Phase>("scanning");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const submittingRef = useRef(false);

  async function submit(token: string) {
    if (submittingRef.current) return;
    submittingRef.current = true;

    const sessionToken = getEmployeeToken();
    if (!sessionToken) {
      setError("Your session expired. Please log in again.");
      setPhase("error");
      return;
    }

    // Identity check: capture a live front-camera selfie before clocking in.
    // Best-effort — a denied/absent camera still proceeds (server flags it).
    setPhase("selfie");
    let selfie: string | null = null;
    let faceDetected = false;
    if (videoRef.current) {
      const shot = await captureSelfie(videoRef.current);
      selfie = shot.image;
      faceDetected = shot.faceDetected;
    }

    // Location is best-effort — the QR scan is what clocks you in. We try to
    // attach GPS (so the geofence can verify presence) but never block on it.
    const sendScan = async (coords: { lat: number; lng: number; accuracy: number | null } | null) => {
      setPhase("sending");
      try {
        const res = await api<ScanResult>("/api/attendance/scan", {
          method: "POST",
          token: sessionToken,
          body: {
            token,
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
            accuracy: coords?.accuracy ?? null,
            selfie,
            faceDetected,
          },
        });
        setResult(res);
        setPhase("done");
        // The clock-in worked, so the connection does — a good moment to send
        // any failures this phone couldn't report earlier.
        void flushScanFailures();
      } catch (e) {
        // Only report what the server never saw. A rejection it issued (wrong
        // QR, replaced code) is already on its record; duplicating it here
        // would file the employee's own claim as corroboration of itself.
        if (e instanceof NetworkError) {
          void reportScanFailure("network_error", {
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
            accuracy: coords?.accuracy ?? null,
          });
        }
        setError((e as Error).message);
        setPhase("error");
      }
    };

    setPhase("locating");
    if (!("geolocation" in navigator)) {
      await sendScan(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => sendScan({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null }),
      // Permission denied / timeout / unavailable → still clock in via the QR
      // scan, but note the refusal: a clock-in with no location is the one the
      // geofence can't vouch for, and the reason belongs on the record.
      (err) => {
        if (err?.code === 1) void reportScanFailure("location_denied");
        void sendScan(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  // Deep-link path: token already provided, skip the camera entirely.
  useEffect(() => {
    if (presetToken) {
      submit(presetToken);
      return;
    }
    // Camera path.
    const scanner = new Html5Qrcode(SCANNER_ID);
    scannerRef.current = scanner;
    let stopped = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          if (stopped) return;
          stopped = true;
          scanner.stop().catch(() => {});
          submit(extractToken(decoded));
        },
        () => {}
      )
      .catch((err: unknown) => {
        // A refused permission and a camera that won't start are different
        // facts about the same morning, and an appeal turns on which it was.
        const name = (err as { name?: string } | null)?.name ?? "";
        const blocked = name === "NotAllowedError" || /permission|denied/i.test(String(err));
        void reportScanFailure(blocked ? "camera_blocked" : "camera_failed");
        setError("Couldn't open the camera. Grant camera access and reload.");
        setPhase("error");
      });

    return () => {
      stopped = true;
      const s = scannerRef.current;
      if (s && s.getState && s.getState() === 2) s.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetToken]);

  if (phase === "done" && result) {
    const copy =
      result.direction === "check"
        ? STATUS_COPY.check
        : result.direction === "out"
          ? STATUS_COPY.out
          : STATUS_COPY[result.status] ?? STATUS_COPY.normal;
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-2">
          <p className={`font-display text-2xl ${copy.tone}`}>{copy.title}</p>
          <p className="text-sm text-aproksi-ink">{result.workplace?.name}</p>
          <p className="text-xs text-aproksi-slate/60">
            {copy.note}
            {result.distance_m != null ? ` · ${result.distance_m}m from the workplace` : ""}
          </p>
          {result.flags?.length > 0 && (
            <p className="text-xs text-aproksi-red">Flags: {result.flags.join(", ")}</p>
          )}

          {/* The answer counted even when the location could not back it up —
              an honest person indoors with a weak signal must never be left
              with no way to comply. Said out loud so it is not a surprise if
              the employer asks about it. */}
          {result.presence_check?.confirmed && result.presence_check.location_verified === false && (
            <p className="text-xs text-aproksi-amber">
              Your location did not confirm you were inside the workplace area, so
              your employer will see that alongside the check. The check itself is
              answered.
            </p>
          )}

          {/* The rule applied itself the moment the scan landed. Say so here as
              well as by SMS — and say in the same breath that it can be argued
              with, because a deduction you only find out about at month end is
              the thing this product exists to stop. */}
          {result.penalty && (
            <div className="mt-4 rounded-xl border border-aproksi-amber/30 bg-aproksi-amber/5 p-4 text-left">
              <p className="text-sm font-medium text-aproksi-ink">
                {result.penalty.reason} — KES{" "}
                {Number(result.penalty.amount).toLocaleString("en-KE")}
              </p>
              <p className="mt-1 text-xs text-aproksi-slate/70">
                Applied automatically by your employer&apos;s rules. If you think
                it is wrong, say why and it goes to them to decide.
              </p>
              <a
                href="/me/violations"
                className="mt-2 inline-block text-sm text-aproksi-ultra underline underline-offset-2"
              >
                Appeal this
              </a>
            </div>
          )}

          <Button className="mt-4" onClick={() => (window.location.href = "/me")}>
            Done
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (phase === "error") {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <p className="text-sm text-aproksi-red">{error}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {!presetToken && phase === "scanning" && (
          <div id={SCANNER_ID} className="w-full overflow-hidden rounded-xl bg-black/5" />
        )}
        {/* Front-camera preview for the identity selfie. Kept mounted (hidden
            off-selfie) so the ref exists when capture starts. Mirrored for a
            natural "selfie" feel. */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={`mx-auto w-48 h-48 rounded-full object-cover bg-black/5 ${
            phase === "selfie" ? "block" : "hidden"
          }`}
          style={{ transform: "scaleX(-1)" }}
        />
        <p className="text-center text-sm text-aproksi-slate/70">
          {phase === "scanning" && "Point your camera at the workplace QR code."}
          {phase === "selfie" && "Look at the camera to confirm it's you…"}
          {phase === "locating" && "Reading your location…"}
          {phase === "sending" && "Recording your clock-in…"}
        </p>
      </CardContent>
    </Card>
  );
}
