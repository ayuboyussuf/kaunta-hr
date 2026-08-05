-- ─────────────────────────────────────────────────────────────────────────────
-- 010  Half-day leave
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Most leave people actually need is not a day. It is a morning at the clinic,
-- or an afternoon at a funeral. Forcing that into a whole day means either the
-- employee loses a day's pay they didn't need to, or nobody files anything and
-- the day turns up as an unexplained absence — which is how the record stops
-- describing what happened.
--
-- Only single-day requests can be halves: "the afternoon" of a four-day range
-- is not a thing anyone means.

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS half_day text
  CHECK (half_day IS NULL OR half_day IN ('morning', 'afternoon'));

ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_half_day_single_day;
ALTER TABLE leave_requests
  ADD CONSTRAINT leave_half_day_single_day
  CHECK (half_day IS NULL OR start_date = end_date);

COMMENT ON COLUMN leave_requests.half_day IS
  'null = whole day(s); morning/afternoon = half a single day, counted as 0.5 in payroll';
