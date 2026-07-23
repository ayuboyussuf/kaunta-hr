"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  api,
  setEmployeeToken,
  getDeviceFingerprint,
} from "@/lib/api";

type Step = "phone" | "otp" | "pin" | "setpin";

/**
 * Employee sign-in (spec §2): phone → WhatsApp OTP → trusted device → PIN.
 * On a trusted device the employee can log in with PIN alone; a new device
 * forces OTP again.
 */
export default function EmployeeLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0); // seconds until "Resend code" re-enables

  const fp = () => getDeviceFingerprint();

  // Count down the resend cooldown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  async function tryPinFirst() {
    // If this device is trusted and a PIN is set, PIN alone works.
    setError(null);
    setStep("pin");
  }

  async function requestOtp(isResend = false) {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await api("/api/auth/employee/request-otp", { method: "POST", body: { phone } });
      setStep("otp");
      setResendIn(30); // throttle resends
      if (isResend) setNotice("A new code is on its way to your WhatsApp.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ token: string; needsPinSetup: boolean }>(
        "/api/auth/employee/verify-otp",
        { method: "POST", body: { phone, code, fingerprint: fp() } }
      );
      setEmployeeToken(r.token);
      if (r.needsPinSetup) setStep("setpin");
      else router.push("/me");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loginPin() {
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ token: string }>("/api/auth/employee/login-pin", {
        method: "POST",
        body: { phone, pin, fingerprint: fp() },
      });
      setEmployeeToken(r.token);
      router.push("/me");
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "new_device") {
        setError("New device — we'll send a code to your WhatsApp.");
        setStep("phone");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function setNewPin() {
    setLoading(true);
    setError(null);
    try {
      const token = (await import("@/lib/api")).getEmployeeToken();
      await api("/api/auth/employee/set-pin", {
        method: "POST",
        token: token ?? undefined,
        body: { pin },
      });
      router.push("/me");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const input =
    "w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-copper";

  return (
    <main className="min-h-screen grid place-items-center bg-kaunta-stone px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-4xl text-kaunta-ink mb-1">Kaunta HR</h1>
        <p className="text-kaunta-slate/70 text-sm mb-8">Employee sign in</p>

        {step === "phone" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-kaunta-slate mb-1">
                Phone number
              </label>
              <input
                type="tel"
                placeholder="07XX XXX XXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={input}
              />
            </div>
            {error && <p className="text-sm text-kaunta-red">{error}</p>}
            <Button onClick={() => requestOtp()} disabled={loading || !phone} className="w-full">
              {loading ? "Sending…" : "Send code on WhatsApp"}
            </Button>
            <button
              onClick={tryPinFirst}
              className="w-full text-sm text-kaunta-copper hover:underline"
            >
              I have a PIN on this device
            </button>
          </div>
        )}

        {step === "otp" && (
          <div className="space-y-4">
            <p className="text-sm text-kaunta-slate">
              Enter the 6-digit code sent to your WhatsApp{phone ? ` (${phone})` : ""}.
            </p>
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className={`${input} tracking-[0.5em] text-center text-lg`}
            />
            {notice && <p className="text-sm text-kaunta-sage">{notice}</p>}
            {error && <p className="text-sm text-kaunta-red">{error}</p>}
            <Button onClick={verifyOtp} disabled={loading || code.length !== 6} className="w-full">
              {loading ? "Verifying…" : "Verify"}
            </Button>
            <div className="flex items-center justify-between text-sm">
              <button
                onClick={() => requestOtp(true)}
                disabled={loading || resendIn > 0}
                className="text-kaunta-copper hover:underline disabled:text-kaunta-slate/40 disabled:no-underline"
              >
                {resendIn > 0 ? `Resend code in ${resendIn}s` : "Didn't get it? Resend code"}
              </button>
              <button
                onClick={() => {
                  setStep("phone");
                  setCode("");
                  setError(null);
                  setNotice(null);
                }}
                className="text-kaunta-slate/60 hover:underline"
              >
                Change number
              </button>
            </div>
          </div>
        )}

        {step === "pin" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-kaunta-slate mb-1">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={input}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-kaunta-slate mb-1">PIN</label>
              <input
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className={`${input} tracking-[0.4em] text-center`}
              />
            </div>
            {error && <p className="text-sm text-kaunta-red">{error}</p>}
            <Button onClick={loginPin} disabled={loading || pin.length < 4} className="w-full">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        )}

        {step === "setpin" && (
          <div className="space-y-4">
            <p className="text-sm text-kaunta-slate">
              Create a PIN for faster sign-in on this device.
            </p>
            <input
              inputMode="numeric"
              maxLength={6}
              placeholder="4–6 digits"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className={`${input} tracking-[0.4em] text-center`}
            />
            {error && <p className="text-sm text-kaunta-red">{error}</p>}
            <Button onClick={setNewPin} disabled={loading || pin.length < 4} className="w-full">
              {loading ? "Saving…" : "Save PIN"}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
