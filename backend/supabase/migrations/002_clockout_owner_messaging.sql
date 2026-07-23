-- ── Clock in/out + owner messaging ───────────────────────────────────────────
-- Adds: clock-in vs clock-out direction on attendance scans; an owner phone for
-- notifications; and an owner inbox (owner_notifications) fed by appeals etc.

-- 1) Each scan is now explicitly an 'in' or an 'out'. Existing rows default to 'in'.
ALTER TABLE attendance_entries
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'in'
  CHECK (direction IN ('in', 'out'));

-- 2) Owner phone (E.164) for SMS notifications (appeals, etc.). Optional.
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS phone text;

-- 3) Owner inbox. Written by the backend (service client); read by the owner.
CREATE TABLE IF NOT EXISTS owner_notifications (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id     uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'system',   -- 'appeal' | 'system' | ...
  title      text NOT NULL,
  body       text NOT NULL,
  link       text,                             -- e.g. /dashboard/violations
  ref_id     uuid,                             -- related appeal/violation id
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS owner_notifications_org_idx
  ON owner_notifications (org_id, created_at DESC);

ALTER TABLE owner_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages own notifications" ON owner_notifications FOR ALL
  USING (org_id = get_auth_user_org_id())
  WITH CHECK (org_id = get_auth_user_org_id());
