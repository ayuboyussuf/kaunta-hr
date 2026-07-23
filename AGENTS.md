# Kaunta-HR — Build Contract for Module Agents

Read this fully before writing code. It keeps parallel modules conflict-free and
consistent. **This product ships to a real paying customer — there is NO mock
mode. Every integration must be real.**

## Golden rules
1. **Own only your files.** Create files inside YOUR assigned route segments /
   `.route.ts` files. Do NOT edit another module's files.
2. **Never edit these shared files:** `backend/src/index.ts`,
   `backend/src/routes/registry.ts`, `backend/src/lib/**` (read-only — reuse them),
   `frontend/lib/supabase/**`, `frontend/lib/api.ts`, `frontend/proxy.ts`,
   `frontend/app/layout.tsx`, either `package.json`, `frontend/app/globals.css`.
   If you truly need a new dependency or a shared-lib change, DO NOT install/edit —
   note it in your final report and the lead will handle it.
3. **No new npm dependencies.** Everything you need is already installed
   (backend: express, zod, jsonwebtoken, bcryptjs, pdfkit, qrcode, @supabase/supabase-js;
   frontend: next 16, react 19, tailwind v4, @supabase/ssr, lucide-react, framer-motion,
   recharts, html5-qrcode, qrcode.react).
4. **No mock/stub/placeholder logic.** Use the real integration libs below.
5. Typecheck before you finish: backend `npx tsc --noEmit` (in `backend/`),
   frontend `node node_modules/next/dist/bin/next build` (in `frontend/`). Both must pass.

## Backend conventions
- **Routes auto-load.** Create files named `*.route.ts` anywhere under
  `backend/src/routes/<yourarea>/`. Each must `export default { basePath, router }`
  (an Express Router). `index.ts` mounts them automatically — never touch it.
  Example:
  ```ts
  import { Router } from "express";
  const router = Router();
  router.get("/", requireOwner, async (req, res) => { /* ... */ });
  export default { basePath: "/api/workplaces", router };
  ```
- **Auth middleware** (`backend/src/lib/auth.ts`):
  - `requireOwner` → attaches `req.owner = { userId, orgId }` (Supabase owner).
  - `requireEmployee` → attaches `req.employee = { employeeId, orgId }` (employee JWT).
- **DB** (`backend/src/lib/supabase.ts`): `getServiceClient()` (bypasses RLS — use for
  employee flows + cron) and `getUserClient(token)` (RLS-scoped). Owner routes may use
  the service client scoped by `req.owner.orgId`.
- **Integration libs (reuse — do not reimplement):**
  - **Messaging is Africa's Talking SMS.** Prefer `lib/messaging` → `sendText`, `sendOtp`,
    `sendDocument` (PDFs go out as a secure link — SMS can't attach files), `toMsisdn`.
    `lib/whatsapp/meta.ts` is a back-compat shim over the same layer (`sendText`,
    `sendTemplate`, `sendOtpTemplate`, `sendDocument`, `toWaNumber`) — existing call sites keep working.
  - `lib/otp` → `requestOtp`, `verifyOtp`.
  - `lib/pdf/render.ts` → `renderToBuffer`, `uploadPdf`, `drawHeader`, `drawFooter`, `BRAND`, `fmtKes`.
  - `lib/pdf/templates.ts` → `setupSummaryPdf`, `violationOutcomePdf`, `payslipPdf`.
  - `lib/attendance/geofence.ts` → `evaluateScan`, `haversineMeters`.
  - `lib/qr.ts` → `signWorkplaceToken`, `verifyWorkplaceToken`.
  - `lib/violations/finalize.ts` → `finalizeViolation(id, "upheld"|"waived")` (locks + PDF + WhatsApp).
- **Validation:** use `zod` on request bodies. Return `{ error: string }` with a proper status.

## Frontend conventions
- Next 16 App Router, Tailwind v4, the Kaunta design system (already in `globals.css`).
  Palette classes: `kaunta-ink|slate|copper|copper-lt|sage|sage-lt|stone|mist|amber|red`.
  Fonts: `font-display` (Instrument Serif) for headings, default DM Sans body,
  `.tabular-nums` for figures. Card style: `rounded-[12px] border border-kaunta-mist bg-white shadow-[0_2px_16px_rgba(15,25,35,0.08)]`.
- Reuse `components/ui/button.tsx` and `card.tsx`. Add module-local components inside
  your own folder if needed.
- **Owner pages** live under `app/dashboard/<yourseg>/`. Read the Supabase session with
  `createClient()` from `@/lib/supabase/server` (server) or `@/lib/supabase/client` (client),
  and call the backend via `api()` from `@/lib/api` passing the owner's Supabase access token
  (`supabase.auth.getSession()` → `access_token`).
- **Employee pages** live under `app/me/<yourseg>/`. Use `getEmployeeToken()` from `@/lib/api`
  as the bearer token for backend calls; redirect to `/me/login` if absent.
- Keep the body background `bg-kaunta-stone`.

## Data model
See `backend/supabase/migrations/001_kaunta_hr_schema.sql` for all tables, columns,
statuses, and RLS. Do not add migrations without noting it in your report.
