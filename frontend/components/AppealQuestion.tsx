"use client";

/**
 * The one question, answered from the dashboard.
 *
 * Not a chat. One question, one answer, and then it is closed. Two things in
 * the design matter more than they look:
 *
 * "I don't have this" is a button of equal weight, not a link hidden under the
 * form. Most people who were genuinely ill for a morning never obtain
 * paperwork, and a screen that only accepts documents turns not having money
 * or time into an admission.
 *
 * And the copy says plainly that answering does not decide anything. The
 * employee is being asked for something that goes to their employer, not
 * submitting to a machine that will judge them.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api, getEmployeeToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface InfoRequest {
  id: string;
  appeal_id: string;
  ask_code: "which_road" | "sick_note";
  question: string;
  asked_at: string;
}

/** Read a chosen file as a data URL, bounded so a 12MP photo can't be posted raw. */
function readImage(file: File, maxPx = 1400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file is not an image."));
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function AppealQuestion() {
  const [requests, setRequests] = useState<InfoRequest[]>([]);
  const [answer, setAnswer] = useState("");
  const [document, setDocument] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const token = getEmployeeToken();
    if (!token) return;
    try {
      const r = await api<{ requests: InfoRequest[] }>("/api/appeal-info/mine", { token });
      setRequests(r.requests ?? []);
    } catch {
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const current = requests[0];
  if (!current || done) return null;

  const wantsDocument = current.ask_code === "sick_note";

  async function send(declined: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/appeal-info/${current.id}/answer`, {
        method: "POST",
        token: getEmployeeToken()!,
        body: declined
          ? { declined: true }
          : { answer: answer.trim() || undefined, document: document ?? undefined },
      });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setDocument(await readImage(file));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card className="border-aproksi-ultra/30 bg-aproksi-ultra-lt/40 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-aproksi-ultra">
        About your appeal
      </p>
      <p className="mt-2 text-sm font-medium text-aproksi-ink">{current.question}</p>
      <p className="mt-1 text-xs text-aproksi-slate/70">
        Whatever you send goes to your employer, who decides. Answering this
        doesn&apos;t settle anything on its own.
      </p>

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder={
          wantsDocument ? "Anything you want to add (optional)" : "Which road, and roughly when"
        }
        className="mt-3 w-full rounded-lg border border-aproksi-mist bg-white p-3 text-sm text-aproksi-ink placeholder:text-aproksi-slate/40 focus:border-aproksi-ultra focus:outline-none"
      />

      {wantsDocument && (
        <div className="mt-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-aproksi-mist bg-white px-4 text-sm text-aproksi-slate hover:border-aproksi-ultra/40"
          >
            {document ? "Photo attached — tap to replace" : "Take a photo of the note"}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-aproksi-red">{error}</p>}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button
          onClick={() => send(false)}
          disabled={busy || (!answer.trim() && !document)}
          className="sm:flex-1"
        >
          {busy ? "Sending…" : "Send this"}
        </Button>
        {/* Equal weight on purpose — see the note at the top of this file. */}
        <Button variant="outline" onClick={() => send(true)} disabled={busy} className="sm:flex-1">
          {wantsDocument ? "I don't have a note" : "I can't say which road"}
        </Button>
      </div>
    </Card>
  );
}

export default AppealQuestion;
