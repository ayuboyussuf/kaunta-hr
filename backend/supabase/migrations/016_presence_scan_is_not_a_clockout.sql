-- ─────────────────────────────────────────────────────────────────────────────
-- 016  A presence check is not a clock-out
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every scan toggled: if your last scan today was an 'in', the next one was an
-- 'out'. That is right for the two scans that bracket a shift and wrong for
-- everything else — and a presence check is everything else.
--
-- So answering "confirm you are at work" clocked the employee OUT. They were
-- then not clocked in, so no further check could fire at them, the day's hours
-- ended early, and the roster showed them as having left while they stood at
-- the till. The one scan whose entire purpose is to prove somebody is present
-- was recording that they had gone.
--
-- 'check' is a third direction. It is a real attendance entry with a real time
-- and a real selfie against it — it simply does not move the clock. Payroll
-- counts days from 'in' and pairs hours from 'in'/'out', so a check scan is
-- invisible to both, which is what it should always have been.

ALTER TABLE attendance_entries
  DROP CONSTRAINT IF EXISTS attendance_entries_direction_check;
ALTER TABLE attendance_entries
  ADD CONSTRAINT attendance_entries_direction_check
  CHECK (direction IN ('in', 'out', 'check'));

COMMENT ON COLUMN attendance_entries.direction IS
  'in / out bracket a shift. check = answered a presence check and does not move the clock.';

-- ── Whether the location backed the answer up ────────────────────────────────
--
-- A check used to be confirmed only when the scan was inside the geofence.
-- With bad GPS — indoors, under cover, a cheap handset — an employee standing
-- exactly where they should be could not answer at all. The check stayed
-- pending, aged into 'missed', flagged their clock-in, and there was nothing
-- they could do about it.
--
-- Now the answer always counts and the quality of it is recorded. An owner can
-- see that somebody confirmed from outside the radius; the employee is never
-- left with no way to comply.

ALTER TABLE presence_checks
  ADD COLUMN IF NOT EXISTS location_verified boolean;

COMMENT ON COLUMN presence_checks.location_verified IS
  'True = the confirming scan was inside the geofence. False = it was not. Null = no coordinates to judge by.';
