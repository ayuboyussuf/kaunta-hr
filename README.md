# Kaunta HR

Attendance, rosters, penalties & payroll for teams — the HR sibling of
[Kaunta](https://kaunta.co.ke). QR + GPS clock-in, SMS onboarding, appeals,
and payslips. **Every integration is real — there is no mock mode.**

## Architecture (two-tier, mirrors kaunta-web)

```
frontend/   Next.js 16 (App Router) → Vercel   — owner + employee dashboards, auth UI
backend/    Express + TS            → Render    — SMS, OTP, PDFs, geofence, cron
```

- **DB / Auth / Storage**: Supabase (Postgres + RLS + `documents` bucket).
- **Owners** sign in with Supabase Auth (email/password); data is RLS-scoped by org.
- **Employees** are not Supabase users — phone → SMS OTP → trusted device → PIN,
  with backend-issued session JWTs. All employee data flows through the backend.
- **Messaging**: Africa's Talking SMS (OTP, invites, announcements, and PDF download
  links — SMS can't attach files, so payslip/appeal/setup PDFs are delivered as a secure
  link). Routed through `lib/messaging`; a `lib/whatsapp/meta.ts` shim keeps the same call
  sites, so WhatsApp can be swapped in later without touching feature code.
- **Attendance**: signed workplace QR (scanned in the employee dashboard) + GPS; the
  server timestamps and runs geofence + impossible-jump heuristics.

## Design system

Ported verbatim from the Kaunta web app (`frontend/app/globals.css`): ink/copper/sage
palette, Instrument Serif (display) / DM Sans (body) / JetBrains Mono (numbers).

## Setup

```bash
# Database
#   Run backend/supabase/migrations/001_kaunta_hr_schema.sql in the Supabase SQL editor.

# Backend
cd backend && npm install && cp .env.example .env   # fill in real credentials
npm run dev                                          # http://localhost:4000

# Frontend
cd frontend && npm install && cp .env.example .env.local
npm run dev                                          # http://localhost:3000
```

### Credentials required (no mock — all real)
- **Supabase**: `SUPABASE_URL`, anon key, `SUPABASE_SERVICE_KEY`.
- **Africa's Talking**: `AT_USERNAME` (`sandbox` for free testing), `AT_API_KEY`, and an
  optional `AT_SENDER_ID`. https://account.africastalking.com
- **Own secrets**: `QR_TOKEN_SECRET`, `EMPLOYEE_JWT_SECRET`, `CRON_SECRET`.

## Module map (build status)

| # | Module | Status |
|---|--------|--------|
| — | Foundation (scaffold, schema, integration libs, auth) | ✅ done |
| 1 | Owner onboarding wizard + PDF summary | ✅ |
| 2 | Auth & trusted-device (employee) | ✅ backend + login UI |
| 3 | Attendance (QR + GPS + geofence) | ✅ scan API + camera clock-in + `/scan` + owner QR |
| 4 | Roster / shifts | ✅ |
| 5 | Penalties & appeals + PDFs | ✅ |
| 6 | Payroll & deductions + payslips | ✅ |
| 7 | Announcements | ✅ |
| 8 | Employee view | ✅ |
| 9 | Owner dashboard (live) | ✅ hub + live attendance + appeals queue |
