-- ── Attendance integrity: selfies + mid-shift presence checks ────────────────
-- Adds: a stored selfie per scan (buddy-punching deterrent, owner-reviewed);
-- per-org random presence-check config; a presence_checks table; and Web Push
-- subscriptions for prompting employees mid-shift.
--
-- Safe to re-run: every statement is IF NOT EXISTS / DROP-then-CREATE.

-- 1) Each scan can carry a selfie (object path in the private `selfies` bucket).
ALTER TABLE attendance_entries
  ADD COLUMN IF NOT EXISTS selfie_path text;

-- 2) Per-org random presence-check configuration. 0 checks = feature off.
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS presence_checks_per_shift int NOT NULL DEFAULT 0;
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS presence_check_window_min int NOT NULL DEFAULT 10;
-- When true, a presence prompt also SMSes employees without a push device
-- (costs money per check). When false, push + in-app banner only.
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS presence_sms_fallback boolean NOT NULL DEFAULT true;

-- 3) Presence checks — one row per prompt fired at a clocked-in employee.
CREATE TABLE IF NOT EXISTS presence_checks (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id        uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- the clock-IN entry this check belongs to (the open session), for grouping.
  session_entry_id   uuid REFERENCES attendance_entries(id) ON DELETE SET NULL,
  due_at             timestamptz NOT NULL DEFAULT now(),
  respond_by         timestamptz NOT NULL,
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'confirmed', 'missed')),
  -- the scan that answered the check, once confirmed.
  responded_entry_id uuid REFERENCES attendance_entries(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS presence_checks_emp_idx
  ON presence_checks (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS presence_checks_pending_idx
  ON presence_checks (status, respond_by);

ALTER TABLE presence_checks ENABLE ROW LEVEL SECURITY;
-- Owner reads presence checks for their own employees (service client writes).
DROP POLICY IF EXISTS "owner reads presence checks" ON presence_checks;
CREATE POLICY "owner reads presence checks" ON presence_checks FOR SELECT
  USING (employee_id IN (SELECT id FROM employees WHERE org_id = get_auth_user_org_id()));

-- 4) Web Push subscriptions (employee PWA), for firing presence prompts.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  endpoint     text NOT NULL,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, endpoint)
);
CREATE INDEX IF NOT EXISTS push_subscriptions_emp_idx
  ON push_subscriptions (employee_id);

-- push_subscriptions are read/written only by the service client (custom
-- employee auth), so RLS stays on with no policies (deny-by-default).
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
