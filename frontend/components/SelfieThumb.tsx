"use client";

/**
 * Lazily loads a clock-in/out selfie for owner review. The photo lives in a
 * private bucket, so we fetch a short-lived signed URL from the owner-scoped
 * backend endpoint only when the owner clicks — nothing is loaded eagerly.
 */
import { useState } from "react";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

export default function SelfieThumb({ entryId, label }: { entryId: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function load() {
    if (url || loading) return;
    setLoading(true);
    setError(false);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await api<{ url: string }>(`/api/attendance/selfie/${entryId}`, { token: token ?? undefined });
      setUrl(res.url);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <a href={url} target="_blank" rel="noreferrer" title={`${label} selfie`}>
        <img src={url} alt={`${label} selfie`} className="h-16 w-16 rounded-lg object-cover border border-kaunta-mist" />
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={load}
      className="text-xs text-kaunta-ultra hover:underline disabled:opacity-50"
      disabled={loading}
    >
      {loading ? "Loading…" : error ? "Retry photo" : `View ${label} photo`}
    </button>
  );
}
