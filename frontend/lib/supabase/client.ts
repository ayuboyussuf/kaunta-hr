import { createBrowserClient } from "@supabase/ssr";

// Fall back to harmless placeholders so the app builds before real credentials
// are configured. At runtime with real env vars, the real project is used.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export function createClient() {
  return createBrowserClient(URL, ANON);
}
