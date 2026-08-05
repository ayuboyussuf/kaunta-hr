-- ─────────────────────────────────────────────────────────────────────────────
-- 008  "On leave" is a state attendance can be in
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Until now a scan could only be normal / late / flagged / adjusted, so an
-- employee whose leave the owner had already approved and who came in anyway
-- was recorded as LATE and automatically fined. The day was signed off; the
-- record has to be able to say so.
--
-- A scan on an approved leave day is now recorded as 'on_leave': it is a real
-- attendance entry with a real time on it, but it is not late, and the rules
-- engine will not price it.

ALTER TABLE attendance_entries
  DROP CONSTRAINT IF EXISTS attendance_entries_status_check;

ALTER TABLE attendance_entries
  ADD CONSTRAINT attendance_entries_status_check
  CHECK (status IN ('normal', 'late', 'flagged', 'adjusted', 'on_leave'));

COMMENT ON COLUMN attendance_entries.status IS
  'normal | late | flagged (integrity) | adjusted (owner correction) | on_leave (day covered by approved leave)';
