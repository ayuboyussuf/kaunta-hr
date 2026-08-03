"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function OwnerLoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    // Return the owner to where they were headed, if the middleware sent a
    // ?next= (only same-app /dashboard paths, to avoid an open redirect).
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(next && next.startsWith("/dashboard") ? next : "/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen grid place-items-center bg-kaunta-stone px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-4xl text-kaunta-ink mb-1">Kaunta HR</h1>
        <p className="text-kaunta-slate/70 text-sm mb-8">Owner sign in</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-kaunta-slate mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-ultra"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-kaunta-slate mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-ultra"
            />
          </div>
          {error && <p className="text-sm text-kaunta-red">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="text-sm text-kaunta-slate/70 mt-6">
          New here?{" "}
          <Link href="/signup" className="text-kaunta-ultra hover:underline">
            Create an owner account
          </Link>
        </p>
        <p className="text-sm text-kaunta-slate/70 mt-2">
          Employee?{" "}
          <Link href="/me/login" className="text-kaunta-ultra hover:underline">
            Sign in with your phone
          </Link>
        </p>
      </div>
    </main>
  );
}
