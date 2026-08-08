"use client";

/**
 * "Check on this person now."
 *
 * The schedule handles the random checks. This is the other half of the
 * feature, and it was missing entirely: an owner watching the roster has a
 * specific reason to want a specific person to prove where they are, and until
 * now the only answer was to wait for a draw that might not come today.
 *
 * It sits on the roster row rather than in a menu because that is where the
 * question occurs — you are looking at somebody's name and wondering.
 *
 * The result is stated plainly, including the refusals. "Not clocked in" and
 * "already has one open" are both correct answers and both need saying; a
 * button that silently does nothing on those is how people conclude a feature
 * is broken.
 */

import { useState } from "react";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; until: string }
  | { kind: "refused"; why: string };

export function CheckNowButton({
  employeeId,
  name,
  clockedIn,
}: {
  employeeId: string;
  name: string;
  clockedIn: boolean;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function send() {
    setState({ kind: "sending" });
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const r = await api<{ check: { respond_by: string }; window_min: number }>(
        `/api/presence/check/${employeeId}`,
        { method: "POST", token: data.session?.access_token ?? "" }
      );
      setState({
        kind: "sent",
        until: new Date(r.check.respond_by).toLocaleTimeString("en-KE", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      });
    } catch (e) {
      setState({ kind: "refused", why: (e as Error).message });
    }
  }

  if (state.kind === "sent") {
    return (
      <p className="text-xs text-aproksi-sage">
        Asked {name.split(" ")[0]} to confirm — they have until {state.until}.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={send}
        disabled={state.kind === "sending" || !clockedIn}
        title={
          clockedIn
            ? "Send a check now — they must scan the workplace QR to confirm"
            : "They are not clocked in, so there is nothing to confirm"
        }
        className="inline-flex min-h-[36px] items-center rounded-lg border border-aproksi-mist bg-white px-3 text-xs text-aproksi-slate transition-colors hover:border-aproksi-ultra/40 hover:text-aproksi-ultra disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state.kind === "sending" ? "Sending…" : "Check on them now"}
      </button>
      {state.kind === "refused" && <p className="text-xs text-aproksi-red">{state.why}</p>}
    </div>
  );
}

export default CheckNowButton;
