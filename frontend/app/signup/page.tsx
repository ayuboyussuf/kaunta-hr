"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function OwnerSignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    // Org creation happens in the onboarding wizard on first dashboard visit.
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen grid place-items-center bg-kaunta-stone px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-4xl text-kaunta-ink mb-1">Kaunta HR</h1>
        <p className="text-kaunta-slate/70 text-sm mb-8">Create your owner account</p>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-kaunta-slate mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-copper"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-kaunta-slate mb-1">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-kaunta-mist bg-white px-3 py-2 text-sm outline-none focus:border-kaunta-copper"
            />
          </div>
          {error && <p className="text-sm text-kaunta-red">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating…" : "Create account"}
          </Button>
        </form>

        <p className="text-sm text-kaunta-slate/70 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-kaunta-copper hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
