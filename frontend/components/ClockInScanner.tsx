"use client";

/**
 * Camera QR scanner + geolocation clock-in, shared by /me/clock-in (in-dashboard)
 * and /scan (deep-link fallback). On a successful decode it reads the device GPS
 * and POSTs { token, lat, lng, accuracy } to the backend, which stamps the time
 * server-side and returns the assigned status.
 */
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { api, getEmployeeToken } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Phase = "scanning" | "locating" | "sending" | "done" | "error";

interface ScanResult {
  status: "normal" | "late" | "flagged";
  distance_m: number;
  flags: string[];
  workplace: { name: string };
}

const STATUS_COPY: Record<string, { title: string; tone: string; note: string }> = {
  normal: { title: "Clocked in — on time", tone: "text-kaunta-sage", note: "You're inside the workplace area." },
  late: { title: "Clocked in — late", tone: "text-kaunta-amber", note: "Recorded as late against your shift." },
  flagged: { title: "Clocked in — flagged", tone: "text-kaunta-red", note: "This scan was flagged for review." },
};

const SCANNER_ID = "kaunta-qr-reader";

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

    setPhase("locating");
    if (!("geolocation" in navigator)) {
      setError("This device can't share its location, which is required to clock in.");
      setPhase("error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setPhase("sending");
        try {
          const res = await api<ScanResult>("/api/attendance/scan", {
            method: "POST",
            token: sessionToken,
            body: {
              token,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? null,
            },
          });
          setResult(res);
          setPhase("done");
        } catch (e) {
          setError((e as Error).message);
          setPhase("error");
        }
      },
      (geoErr) => {
        setError(
          geoErr.code === geoErr.PERMISSION_DENIED
            ? "Location permission denied. Enable it to clock in."
            : "Couldn't get your location. Try again outdoors with GPS on."
        );
        setPhase("error");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
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
      .catch(() => {
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
    const copy = STATUS_COPY[result.status] ?? STATUS_COPY.normal;
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-2">
          <p className={`font-display text-2xl ${copy.tone}`}>{copy.title}</p>
          <p className="text-sm text-kaunta-ink">{result.workplace?.name}</p>
          <p className="text-xs text-kaunta-slate/60">
            {copy.note} · {result.distance_m}m from the workplace
          </p>
          {result.flags?.length > 0 && (
            <p className="text-xs text-kaunta-red">Flags: {result.flags.join(", ")}</p>
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
          <p className="text-sm text-kaunta-red">{error}</p>
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
        {!presetToken && (
          <div id={SCANNER_ID} className="w-full overflow-hidden rounded-xl bg-black/5" />
        )}
        <p className="text-center text-sm text-kaunta-slate/70">
          {phase === "scanning" && "Point your camera at the workplace QR code."}
          {phase === "locating" && "Reading your location…"}
          {phase === "sending" && "Recording your clock-in…"}
        </p>
      </CardContent>
    </Card>
  );
}
