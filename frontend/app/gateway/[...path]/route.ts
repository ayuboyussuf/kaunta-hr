/**
 * Same-origin API gateway.
 *
 * The browser talks to the Express backend through THIS route instead of calling
 * it directly. That removes three whole classes of "Load failed" (a failed
 * browser fetch): cross-origin CORS rejections, HTTPS→HTTP mixed-content blocks,
 * and the client bundle falling back to http://localhost:4000 when
 * NEXT_PUBLIC_BACKEND_URL wasn't baked in at build time.
 *
 * A request to /gateway/api/owner/onboarding/bootstrap is forwarded verbatim
 * (method, Authorization, body, query string) to
 * `${BACKEND_URL}/api/owner/onboarding/bootstrap` server-side, where BACKEND_URL
 * is a runtime env var (no rebuild needed) and the call is server-to-server (no
 * CORS). The upstream status and JSON body are returned unchanged.
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Server-side backend URL. Runtime env (BACKEND_URL) is preferred because it does
// not need to be baked into a build; NEXT_PUBLIC_BACKEND_URL is kept as a
// fallback for existing deployments.
function backendUrl(): string {
  return (
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    "http://localhost:4000"
  );
}

async function forward(req: NextRequest, path: string[]): Promise<NextResponse> {
  const base = backendUrl().replace(/\/$/, "");
  const search = req.nextUrl.search; // preserves ?query=...
  const target = `${base}/${path.join("/")}${search}`;

  const headers: Record<string, string> = {};
  const auth = req.headers.get("authorization");
  if (auth) headers["Authorization"] = auth;
  const contentType = req.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await req.text() : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: body && body.length ? body : undefined,
      // Never cache API responses.
      cache: "no-store",
    });
  } catch (err) {
    // The backend is unreachable (down, wrong URL, DNS). Return a clear 502 so
    // the client shows an actionable message instead of a raw fetch failure.
    console.error("[gateway] backend unreachable:", target, err);
    return NextResponse.json(
      { error: "Cannot reach the server. Please try again in a moment." },
      { status: 502 }
    );
  }

  const payload = await upstream.text();
  const resContentType = upstream.headers.get("content-type") ?? "application/json";
  return new NextResponse(payload, {
    status: upstream.status,
    headers: { "content-type": resContentType },
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
