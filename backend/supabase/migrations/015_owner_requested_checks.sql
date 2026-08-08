-- ─────────────────────────────────────────────────────────────────────────────
-- 015  Checks the owner asks for
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every presence check so far has been one the schedule decided on. There was
-- no way for an owner to say "check on this person now" — which is the request
-- they will actually have, because the reason to check somebody is usually a
-- specific suspicion at a specific moment, not a random draw.
--
-- Recording WHO asked matters more than it looks. A random check and a check
-- an employer personally ordered are different events: one is routine, the
-- other is targeted, and if a pattern of targeting one person ever has to be
-- examined, the record needs to be able to show it. So the source is stored,
-- and an owner-requested check never counts against the random quota — asking
-- for one must not use up the day's unpredictable check.

ALTER TABLE presence_checks
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'schedule'
    CHECK (source IN ('schedule', 'owner')),
  ADD COLUMN IF NOT EXISTS requested_by uuid;

COMMENT ON COLUMN presence_checks.source IS
  'schedule = drawn from the random schedule; owner = an employer asked for it directly.';
COMMENT ON COLUMN presence_checks.requested_by IS
  'The owner user who asked, for owner-sourced checks. Null for scheduled ones.';

-- The quota query counts scheduled checks only.
CREATE INDEX IF NOT EXISTS presence_checks_source_idx
  ON presence_checks (employee_id, source, created_at DESC);
