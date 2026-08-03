-- ─────────────────────────────────────────────────────────────────────────────
-- 007  Leave requests, and provenance for automatically-raised violations
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Who raised a violation, and with which engine ────────────────────────────
-- Until now every violation came from an owner pressing a button. The rules
-- engine now raises them on its own, and a deduction has to be able to say
-- which it was, months later, in front of somebody who is disputing it.
ALTER TABLE violations
  ADD COLUMN IF NOT EXISTS raised_by      text NOT NULL DEFAULT 'owner'
    CHECK (raised_by IN ('owner', 'engine')),
  ADD COLUMN IF NOT EXISTS engine_version text;

COMMENT ON COLUMN violations.raised_by IS
  'owner = a person created it; engine = the deterministic rules engine applied a configured rule';
COMMENT ON COLUMN violations.engine_version IS
  'Version of the rule engine that matched, so an old outcome stays explainable';

-- ── Leave ────────────────────────────────────────────────────────────────────
-- Staff file leave ahead of time and the owner decides. An approved day is
-- never treated as an absence, so the engine cannot penalise a day that was
-- signed off. Whether the day is paid is the owner's call per request.
CREATE TABLE IF NOT EXISTS leave_requests (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  reason       text NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  -- null until decided; the owner chooses paid or unpaid at approval
  paid         boolean,
  decided_by   uuid,
  decided_at   timestamptz,
  decision_note text,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT leave_dates_ordered CHECK (end_date >= start_date),
  CONSTRAINT leave_reason_present CHECK (length(btrim(reason)) > 0),
  -- a decided request must say whether it was paid
  CONSTRAINT leave_paid_when_approved
    CHECK (status <> 'approved' OR paid IS NOT NULL)
);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages leave" ON leave_requests FOR ALL
  USING (org_id = get_auth_user_org_id())
  WITH CHECK (org_id = get_auth_user_org_id());

CREATE INDEX IF NOT EXISTS leave_emp_idx  ON leave_requests (employee_id, start_date DESC);
CREATE INDEX IF NOT EXISTS leave_org_idx  ON leave_requests (org_id, status, start_date);
-- the engine checks "is this employee on approved leave on this date" per shift
CREATE INDEX IF NOT EXISTS leave_cover_idx ON leave_requests (employee_id, status, start_date, end_date);

-- ── Notice period ────────────────────────────────────────────────────────────
-- How many clear days before the first day of leave a request must be filed.
-- Configurable per org because a fuel station and a restaurant do not run the
-- same way; 1 day is the default the product ships with.
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS leave_notice_days integer NOT NULL DEFAULT 1
    CHECK (leave_notice_days >= 0 AND leave_notice_days <= 30);

COMMENT ON COLUMN orgs.leave_notice_days IS
  'Clear days of notice required before leave starts. 0 disables the check.';
