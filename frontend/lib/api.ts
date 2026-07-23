/**
 * Thin client for the Kaunta-HR Express backend.
 * - Owner calls pass the Supabase access token.
 * - Employee calls pass the backend-issued employee session JWT.
 */
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string; // owner Supabase token OR employee session JWT
  body?: unknown;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

// ── Employee session storage (client-side) ───────────────────────────────────
const EMP_TOKEN_KEY = "kaunta_hr_emp_token";
const DEVICE_FP_KEY = "kaunta_hr_device_fp";

export function getEmployeeToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(EMP_TOKEN_KEY);
}
export function setEmployeeToken(token: string): void {
  localStorage.setItem(EMP_TOKEN_KEY, token);
}
export function clearEmployeeToken(): void {
  localStorage.removeItem(EMP_TOKEN_KEY);
}

/** Stable per-device fingerprint used for the trusted-device gate. */
export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "server";
  let fp = localStorage.getItem(DEVICE_FP_KEY);
  if (!fp) {
    fp = crypto.randomUUID();
    localStorage.setItem(DEVICE_FP_KEY, fp);
  }
  return fp;
}
