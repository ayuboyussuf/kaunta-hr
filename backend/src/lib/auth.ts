/**
 * Auth helpers + Express middleware for both principals:
 *   • OWNER   — Supabase Auth JWT (verified via supabase-js), resolved to an org.
 *   • EMPLOYEE — our own signed session JWT, issued after OTP/PIN login.
 */
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "./env";
import { getServiceClient, extractToken } from "./supabase";

// ── Owner (Supabase) ─────────────────────────────────────────────────────────
export interface OwnerCtx {
  userId: string;
  orgId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      owner?: OwnerCtx;
      employee?: EmployeeCtx;
    }
  }
}

/**
 * Resolve a Supabase access token to its owner, or null.
 *
 * Split out of requireOwner so a route that accepts EITHER principal can ask
 * "is this an owner?" without a middleware that has already sent a 401.
 */
export async function resolveOwner(token: string): Promise<OwnerCtx | null> {
  if (!token) return null;
  const db = getServiceClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: org } = await db
    .from("orgs")
    .select("id")
    .eq("owner_user_id", data.user.id)
    .maybeSingle();
  if (!org) return null;

  return { userId: data.user.id, orgId: org.id };
}

/** Require a valid Supabase owner session; attaches req.owner with the org id. */
export async function requireOwner(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "unauthorized" });

  const owner = await resolveOwner(token);
  if (!owner) return res.status(401).json({ error: "unauthorized" });

  req.owner = owner;
  next();
}

// ── Employee (custom JWT) ────────────────────────────────────────────────────
export interface EmployeeCtx {
  employeeId: string;
  orgId: string;
}

const EMPLOYEE_SESSION_TTL = "30d";

export function issueEmployeeSession(employeeId: string, orgId: string): string {
  return jwt.sign({ sub: employeeId, org: orgId }, env.employeeJwtSecret(), {
    expiresIn: EMPLOYEE_SESSION_TTL,
  });
}

export function verifyEmployeeSession(token: string): EmployeeCtx | null {
  try {
    const d = jwt.verify(token, env.employeeJwtSecret()) as { sub: string; org: string };
    return { employeeId: d.sub, orgId: d.org };
  } catch {
    return null;
  }
}

/** Require a valid employee session; attaches req.employee. */
export function requireEmployee(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req.headers.authorization);
  const ctx = token ? verifyEmployeeSession(token) : null;
  if (!ctx) return res.status(401).json({ error: "unauthorized" });
  req.employee = ctx;
  next();
}

// ── Device fingerprinting (trusted-device gate) ──────────────────────────────
/** Deterministic, non-reversible device id from a client-provided fingerprint. */
export function hashFingerprint(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
