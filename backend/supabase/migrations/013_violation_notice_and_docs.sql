-- ─────────────────────────────────────────────────────────────────────────────
-- 013  Did they actually hear about it, and does the document still open
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Two gaps, both of which end the same way: an employee saying "nobody told
-- me", and nothing in the record able to contradict them.
--
-- 1. Nothing recorded whether the penalty notice was DELIVERED. The SMS was
--    sent best-effort and its failure was logged to a console nobody reads. A
--    wrong number, an empty Africa's Talking balance, a network blip — the
--    employee genuinely never hears, finds out at payday, and is right to be
--    angry. Now every notice records when it went and why it didn't.
--
-- 2. pdf_url held a SIGNED url with a seven-day expiry, stored permanently.
--    The outcome document — the thing that exists precisely so a decision can
--    still be shown months later — stopped opening after a week, and the only
--    symptom was a dead link. The path is stored instead, and signed on demand
--    behind auth like selfies and appeal documents already are.
--
-- Acknowledgement is the third piece. A notice that was delivered is good; a
-- notice the employee has opened and confirmed is unarguable.

ALTER TABLE violations
  ADD COLUMN IF NOT EXISTS notified_at     timestamptz,
  ADD COLUMN IF NOT EXISTS notify_error    text,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_path        text;

COMMENT ON COLUMN violations.notified_at IS
  'When the penalty notice was accepted by the SMS provider. Null = never delivered.';
COMMENT ON COLUMN violations.notify_error IS
  'Why the notice could not be delivered. Shown to the owner — an undelivered penalty is their problem to fix.';
COMMENT ON COLUMN violations.acknowledged_at IS
  'When the employee opened and confirmed the penalty in the app.';
COMMENT ON COLUMN violations.pdf_path IS
  'Storage path of the outcome document. Signed on demand — pdf_url held an expiring link and rotted after 7 days.';

-- Finding the ones nobody heard about is the point of storing this.
CREATE INDEX IF NOT EXISTS violations_undelivered_idx
  ON violations (employee_id) WHERE notified_at IS NULL;

-- The appeal-window sweep looks these up every 15 minutes.
CREATE INDEX IF NOT EXISTS violations_open_window_idx
  ON violations (appeal_window_end) WHERE status = 'open';
