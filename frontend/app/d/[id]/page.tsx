"use client";

/**
 * The short link that carries an appeal outcome to somebody's phone.
 *
 * The SMS used to contain the signed Supabase URL itself:
 *
 *     Penalty upheld: https://qcdtdnqipxyjdzxgnhpv.supabase.co/storage/v1/
 *     object/sign/documents/violations/592029b0-...pdf?token=eyJraWQiOiIz...
 *
 * Four hundred and forty characters — three SMS segments, the most expensive
 * message in the product — and it put the project reference and a bearer token
 * in plain text in a message that sits unlocked on a phone and gets forwarded.
 * Anybody holding that string could open the document; the link was the
 * credential.
 *
 * This is the same document reached the honest way. The page carries no
 * credential at all: it asks the backend for a fresh signed URL using the
 * reader's OWN session, so the link is worth nothing to whoever finds it, and
 * the signature is minted at the moment of reading rather than baked in a week
 * earlier.
 *
 * It also fixes the quieter half of the old bug. A signed URL expires, so a
 * forwarded message eventually became a dead link with no explanation. This
 * keeps working for as long as the person has a record to look at.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getEmployeeToken } from "@/lib/api";

export default function DocumentLink({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { id } = await params;
      const token = getEmployeeToken();

      // Not signed in on this device. Send them to sign in rather than showing
      // an error — arriving here from a text message on a new phone is the
      // ordinary case, not a failure.
      if (!token) {
        router.replace(`/me/login?next=${encodeURIComponent(`/d/${id}`)}`);
        return;
      }

      try {
        const { url } = await api<{ url: string }>(`/api/violations/${id}/document`, { token });
        window.location.replace(url);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [params, router]);

  return (
    <main className="min-h-screen bg-aproksi-stone px-6 py-16">
      <div className="mx-auto max-w-sm text-center">
        {error ? (
          <>
            <h1 className="font-display text-xl text-aproksi-ink">That document did not open</h1>
            <p className="mt-2 text-sm text-aproksi-slate/70">{error}</p>
            <button
              onClick={() => router.replace("/me/violations")}
              className="mt-6 text-sm text-aproksi-ultra underline underline-offset-4"
            >
              Open your record instead
            </button>
          </>
        ) : (
          <p className="text-sm text-aproksi-slate/60">Opening your document…</p>
        )}
      </div>
    </main>
  );
}
