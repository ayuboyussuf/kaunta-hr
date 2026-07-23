-- ════════════════════════════════════════════════════════════════════════════
-- Kaunta-HR — Initial Schema
-- Run in the Supabase SQL Editor or via `supabase db push`.
--
-- Auth model:
--   • OWNERS authenticate with Supabase Auth (email/password). Their data is
--     RLS-protected via get_auth_user_org_id() (SECURITY DEFINER, no recursion).
--   • EMPLOYEES are NOT Supabase-auth users. They authenticate through the backend
--     (phone → WhatsApp OTP → trusted device → PIN). All employee reads/writes go
--     through the backend service-role client, scoped explicitly by employee_id.
--     So employee-owned tables have RLS enabled with owner-only policies; the
--     service client bypasses RLS for the custom employee flow.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Orgs ─────────────────────────────────────────────────────────────────────
CREATE TABLE orgs (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE UNIQUE,
  -- wizard: does the owner run one workplace or several, and are rules shared?
  workplace_mode text NOT NULL DEFAULT 'single' CHECK (workplace_mode IN ('single', 'multiple')),
  rules_mode     text NOT NULL DEFAULT 'shared' CHECK (rules_mode IN ('shared', 'per_workplace')),
  onboarding_complete boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;

-- ── SECURITY DEFINER helper — the org id of the current Supabase-auth owner ───
-- Reads `orgs` with owner privileges so RLS does NOT re-trigger (avoids the
-- infinite-recursion bug documented in kaunta-web migration 007).
CREATE OR REPLACE FUNCTION get_auth_user_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM orgs WHERE owner_user_id = auth.uid() LIMIT 1;
$$;

CREATE POLICY "owner reads own org"   ON orgs FOR SELECT USING (owner_user_id = auth.uid());
CREATE POLICY "owner creates own org" ON orgs FOR INSERT WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "owner updates own org" ON orgs FOR UPDATE USING (owner_user_id = auth.uid());

-- ── Rulesets (shared or per-workplace) ───────────────────────────────────────
CREATE TABLE rulesets (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name            text NOT NULL,
  is_shared       boolean NOT NULL DEFAULT false,
  -- deduction logic, e.g. {"mode":"fixed"} or {"mode":"per_minute","rate":10}
  deduction_logic jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rulesets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages rulesets" ON rulesets FOR ALL
  USING (org_id = get_auth_user_org_id()) WITH CHECK (org_id = get_auth_user_org_id());

-- ── Workplaces ───────────────────────────────────────────────────────────────
CREATE TABLE workplaces (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name              text NOT NULL,
  lat               double precision,
  lng               double precision,
  geofence_radius_m integer NOT NULL DEFAULT 100 CHECK (geofence_radius_m BETWEEN 10 AND 5000),
  ruleset_id        uuid REFERENCES rulesets(id) ON DELETE SET NULL,
  -- rotating nonce baked into the signed QR token; bump to invalidate old QRs
  qr_nonce          uuid NOT NULL DEFAULT uuid_generate_v4(),
  qr_issued_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE workplaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages workplaces" ON workplaces FOR ALL
  USING (org_id = get_auth_user_org_id()) WITH CHECK (org_id = get_auth_user_org_id());

-- ── Shifts ───────────────────────────────────────────────────────────────────
CREATE TABLE shifts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  workplace_id  uuid NOT NULL REFERENCES workplaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  kind          text NOT NULL DEFAULT 'day' CHECK (kind IN ('day', 'night', 'custom')),
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  -- days the shift runs, 0=Sun … 6=Sat, e.g. [1,2,3,4,5]
  days_of_week  int[] NOT NULL DEFAULT '{1,2,3,4,5}',
  grace_minutes integer NOT NULL DEFAULT 5 CHECK (grace_minutes >= 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
-- workplace_id → workplaces policy (org-scoped) — no recursion (helper reads orgs)
CREATE POLICY "owner manages shifts" ON shifts FOR ALL
  USING (workplace_id IN (SELECT id FROM workplaces WHERE org_id = get_auth_user_org_id()))
  WITH CHECK (workplace_id IN (SELECT id FROM workplaces WHERE org_id = get_auth_user_org_id()));

-- ── Employees ────────────────────────────────────────────────────────────────
CREATE TABLE employees (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  workplace_id uuid REFERENCES workplaces(id) ON DELETE SET NULL,
  shift_id     uuid REFERENCES shifts(id) ON DELETE SET NULL,
  name         text NOT NULL,
  phone        text NOT NULL,                       -- E.164, e.g. +2547XXXXXXXX
  pin_hash     text,                                -- set on first login
  base_salary  numeric(12,2) NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'suspended')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, phone)
);
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages employees" ON employees FOR ALL
  USING (org_id = get_auth_user_org_id()) WITH CHECK (org_id = get_auth_user_org_id());
CREATE INDEX employees_phone_idx ON employees (phone);

-- ── Trusted devices (employee login) ─────────────────────────────────────────
CREATE TABLE devices (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  fingerprint  text NOT NULL,
  trusted_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, fingerprint)
);
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;  -- service-client only

-- ── OTP codes (WhatsApp now; SMS channel later) ──────────────────────────────
CREATE TABLE otp_codes (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone      text NOT NULL,
  code_hash  text NOT NULL,
  purpose    text NOT NULL DEFAULT 'login',
  channel    text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'sms')),
  expires_at timestamptz NOT NULL,
  consumed   boolean NOT NULL DEFAULT false,
  attempts   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;  -- service-client only
CREATE INDEX otp_codes_phone_idx ON otp_codes (phone, created_at DESC);

-- ── Attendance entries ───────────────────────────────────────────────────────
CREATE TABLE attendance_entries (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id    uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  workplace_id   uuid NOT NULL REFERENCES workplaces(id) ON DELETE CASCADE,
  scanned_at     timestamptz NOT NULL DEFAULT now(),   -- SERVER time, never device clock
  lat            double precision,
  lng            double precision,
  accuracy_m     double precision,
  distance_m     double precision,                     -- computed distance from workplace
  status         text NOT NULL DEFAULT 'normal' CHECK (status IN ('normal', 'late', 'flagged', 'adjusted')),
  flags          jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ["outside_geofence","impossible_jump",...]
  roster_expected jsonb,                               -- {shift_id, expected_start, late_by_min}
  adjusted_by    uuid,                                 -- owner user id if manually adjusted
  adjusted_note  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE attendance_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads attendance" ON attendance_entries FOR SELECT
  USING (employee_id IN (SELECT id FROM employees WHERE org_id = get_auth_user_org_id()));
CREATE POLICY "owner updates attendance" ON attendance_entries FOR UPDATE
  USING (employee_id IN (SELECT id FROM employees WHERE org_id = get_auth_user_org_id()));
CREATE INDEX attendance_emp_time_idx ON attendance_entries (employee_id, scanned_at DESC);

-- ── Penalty rules ────────────────────────────────────────────────────────────
CREATE TABLE penalty_rules (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ruleset_id         uuid NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  code               text NOT NULL,                    -- e.g. 'late', 'absent', 'no_show'
  reason             text NOT NULL,
  amount             numeric(12,2) NOT NULL DEFAULT 0,
  calc               jsonb NOT NULL DEFAULT '{}'::jsonb, -- optional per-minute logic etc.
  appeal_window_hours integer NOT NULL DEFAULT 24 CHECK (appeal_window_hours >= 0),
  created_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE penalty_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages penalty rules" ON penalty_rules FOR ALL
  USING (ruleset_id IN (SELECT id FROM rulesets WHERE org_id = get_auth_user_org_id()))
  WITH CHECK (ruleset_id IN (SELECT id FROM rulesets WHERE org_id = get_auth_user_org_id()));

-- ── Pay cycles (declared before violations for the FK) ───────────────────────
CREATE TABLE pay_cycles (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id     uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  label      text NOT NULL,
  start_date date NOT NULL,
  end_date   date NOT NULL,
  pay_date   date NOT NULL,
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'processing', 'paid')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pay_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages pay cycles" ON pay_cycles FOR ALL
  USING (org_id = get_auth_user_org_id()) WITH CHECK (org_id = get_auth_user_org_id());

-- ── Violations ───────────────────────────────────────────────────────────────
CREATE TABLE violations (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  workplace_id      uuid REFERENCES workplaces(id) ON DELETE SET NULL,
  rule_id           uuid REFERENCES penalty_rules(id) ON DELETE SET NULL,
  attendance_id     uuid REFERENCES attendance_entries(id) ON DELETE SET NULL,
  reason            text NOT NULL,
  evidence          text,
  amount            numeric(12,2) NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'appealed', 'accepted', 'rejected', 'locked')),
  appeal_window_end timestamptz NOT NULL,
  outcome           text,
  pdf_url           text,
  pay_cycle_id      uuid REFERENCES pay_cycles(id) ON DELETE SET NULL,
  created_by        uuid,                              -- owner user id
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages violations" ON violations FOR ALL
  USING (employee_id IN (SELECT id FROM employees WHERE org_id = get_auth_user_org_id()))
  WITH CHECK (employee_id IN (SELECT id FROM employees WHERE org_id = get_auth_user_org_id()));
CREATE INDEX violations_emp_idx ON violations (employee_id, created_at DESC);

-- ── Appeals ──────────────────────────────────────────────────────────────────
CREATE TABLE appeals (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  violation_id uuid NOT NULL REFERENCES violations(id) ON DELETE CASCADE,
  message      text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  decision     text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'accepted', 'rejected')),
  decided_at   timestamptz,
  decided_by   uuid
);
ALTER TABLE appeals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages appeals" ON appeals FOR ALL
  USING (violation_id IN (
    SELECT v.id FROM violations v
    JOIN employees e ON e.id = v.employee_id
    WHERE e.org_id = get_auth_user_org_id()));

-- ── Payslips ─────────────────────────────────────────────────────────────────
CREATE TABLE payslips (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cycle_id    uuid NOT NULL REFERENCES pay_cycles(id) ON DELETE CASCADE,
  gross       numeric(12,2) NOT NULL DEFAULT 0,
  deductions  jsonb NOT NULL DEFAULT '[]'::jsonb,      -- [{reason, amount, violation_id}]
  net         numeric(12,2) NOT NULL DEFAULT 0,
  pdf_url     text,
  sent_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, cycle_id)
);
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages payslips" ON payslips FOR ALL
  USING (employee_id IN (SELECT id FROM employees WHERE org_id = get_auth_user_org_id()))
  WITH CHECK (employee_id IN (SELECT id FROM employees WHERE org_id = get_auth_user_org_id()));

-- ── Announcements ────────────────────────────────────────────────────────────
CREATE TABLE announcements (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  scope        text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'workplace')),
  workplace_id uuid REFERENCES workplaces(id) ON DELETE CASCADE,
  type         text NOT NULL DEFAULT 'other',          -- meeting, policy_update, schedule_change, other
  title        text NOT NULL,
  body         text NOT NULL,
  posted_at    timestamptz NOT NULL DEFAULT now(),
  created_by   uuid
);
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages announcements" ON announcements FOR ALL
  USING (org_id = get_auth_user_org_id()) WITH CHECK (org_id = get_auth_user_org_id());

-- ── Storage bucket for all generated PDFs ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;
