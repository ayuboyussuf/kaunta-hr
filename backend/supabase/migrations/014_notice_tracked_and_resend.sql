-- ─────────────────────────────────────────────────────────────────────────────
-- 014  Don't accuse the past, and give the alert something to do
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Migration 013 added violations.notified_at, and every row that already
-- existed got NULL — which the dashboard then read as "the text never went
-- out". It hadn't failed. We simply had not been recording it yet. So a live
-- business opened Kaunta to nine red penalties supposedly never delivered,
-- with no way to clear them, because there is no truth to discover about a
-- send that predates the recording of sends.
--
-- Absence of evidence was being shown as evidence of absence. This column says
-- which rows we actually watched.
--
-- Everything from here on is tracked; everything before is honestly marked as
-- unknown and stays out of the count.

ALTER TABLE violations
  ADD COLUMN IF NOT EXISTS notice_tracked boolean NOT NULL DEFAULT true;

-- Rows that existed before delivery was recorded. Their notified_at is NULL
-- because nothing was watching, not because anything failed.
UPDATE violations
   SET notice_tracked = false
 WHERE notified_at IS NULL
   AND notify_error IS NULL;

COMMENT ON COLUMN violations.notice_tracked IS
  'False for rows raised before delivery was recorded — their null notified_at means unknown, not failed.';

-- The alert reads this: undelivered AND actually watched.
DROP INDEX IF EXISTS violations_undelivered_idx;
CREATE INDEX IF NOT EXISTS violations_undelivered_idx
  ON violations (employee_id)
  WHERE notified_at IS NULL AND notice_tracked;
