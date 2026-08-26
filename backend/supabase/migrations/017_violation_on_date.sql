-- ─────────────────────────────────────────────────────────────────────────────
-- 017  A penalty has to know which day it is about.
--
-- Until now it did not. A lateness penalty could be dated indirectly, by
-- joining to the scan that triggered it; an ABSENCE penalty had no route to a
-- date at all, because absence means there is no scan and `attendance_id` is
-- therefore NULL. The day only existed as English prose inside `evidence`.
--
-- That is not a tidiness problem. Everything that has to answer "was this day
-- covered by approved leave?" needs the date, and the appeal assist gave up
-- silently when it could not find one: an employee appealing an absence with
-- "I was on approved leave" got a brief saying the record held nothing either
-- way, while the approved leave sat in the next table.
--
-- Nothing here changes an amount, a status or a payslip. It gives every
-- penalty a date and backfills the ones already written.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE violations
  ADD COLUMN IF NOT EXISTS on_date date;

COMMENT ON COLUMN violations.on_date IS
  'The Nairobi calendar day this penalty is about — the day of the scan for a '
  'lateness penalty, the rostered day for an absence. Set by the rules engine. '
  'Used to ask whether approved leave covers the day.';

-- ── Backfill 1: penalties attached to a scan ────────────────────────────────
-- The scan time is authoritative. Africa/Nairobi is UTC+3 year round, so this
-- is an offset conversion with no DST edge to get wrong.
UPDATE violations v
   SET on_date = (a.scanned_at AT TIME ZONE 'Africa/Nairobi')::date
  FROM attendance_entries a
 WHERE v.attendance_id = a.id
   AND v.on_date IS NULL;

-- ── Backfill 2: absences, from the sentence the engine wrote ────────────────
-- Every absence raised by the engine carries "...rostered for YYYY-MM-DD" in
-- its evidence. Parsing prose is not a thing to build on, which is exactly why
-- the column now exists — but for rows already in the table it is the only
-- place the date was ever recorded, and it is better than discarding it.
UPDATE violations
   SET on_date = substring(evidence from 'rostered for (\d{4}-\d{2}-\d{2})')::date
 WHERE on_date IS NULL
   AND evidence ~ 'rostered for \d{4}-\d{2}-\d{2}';

-- ── Backfill 3: everything else ─────────────────────────────────────────────
-- Owner-raised penalties (phone use, out of uniform) have no scan and no
-- rostered day in their evidence. They were raised on the day they happened,
-- so the creation day is the honest answer rather than a guess.
UPDATE violations
   SET on_date = (created_at AT TIME ZONE 'Africa/Nairobi')::date
 WHERE on_date IS NULL;

-- Deliberately NOT NOT NULL: an old row whose evidence was edited by hand
-- could still be null, and failing an insert over it would be worse than
-- carrying the gap. New rows get the date from the engine.
CREATE INDEX IF NOT EXISTS violations_employee_on_date_idx
  ON violations (employee_id, on_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- Why a penalty disappeared.
--
-- Approving leave now cancels the penalties already sitting on the days it
-- covers — the absence sweep runs at 21:30 and an approval that arrives the
-- next morning used to leave the charge standing forever, which made the
-- approval SMS ("you will not be marked absent on those days") untrue.
--
-- A cancelled penalty must not look like an owner decision, and must not look
-- like a row that was never there. These three columns are the difference.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE violations
  ADD COLUMN IF NOT EXISTS voided_reason text
    CHECK (voided_reason IS NULL OR voided_reason IN ('leave_approved')),
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid;

COMMENT ON COLUMN violations.voided_reason IS
  'Set when the penalty was cancelled by something other than a decision on an '
  'appeal. Currently only leave_approved. NULL for every ordinary penalty.';

-- ─────────────────────────────────────────────────────────────────────────────
-- The appeal assist can now route "I was on approved leave".
--
-- Without this the feature fails in production and passes every test: the fake
-- database used by the suite does not enforce CHECK constraints, so an
-- `on_leave` brief assembles perfectly, then dies on the INSERT with a
-- constraint violation — and the failure lands in a catch that logs and returns
-- null, which looks exactly like "no brief was produced" rather than "the
-- schema refused it".
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE appeal_assists
  DROP CONSTRAINT IF EXISTS appeal_assists_claim_check;

ALTER TABLE appeal_assists
  ADD CONSTRAINT appeal_assists_claim_check
  CHECK (claim IN ('system_not_working', 'sick', 'road_closed', 'on_leave', 'unclear'));

