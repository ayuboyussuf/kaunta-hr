-- ─────────────────────────────────────────────────────────────────────────────
-- 019  The appeal assist can route "I was on approved leave"
-- ─────────────────────────────────────────────────────────────────────────────
--
-- This started life inside 017, which was the wrong place for it: 017 shipped
-- and merged without it, so any deployment that has already applied 017 has the
-- on_leave routing in code and a CHECK constraint that rejects it. A migration
-- runner that tracks applied files by name would never re-run 017, and the fix
-- would be silently skipped exactly where it is needed.
--
-- Left un-run, the failure is quiet in the worst way. An on_leave brief
-- assembles correctly, then dies on the INSERT with a constraint violation —
-- and persist() logs the error and returns null, which the caller reads as
-- "there was nothing to work with". The symptom is the original bug coming
-- back unchanged, with one line in the logs as the only clue.
--
-- Safe to run whether or not the constraint was already widened.

ALTER TABLE appeal_assists
  DROP CONSTRAINT IF EXISTS appeal_assists_claim_check;

ALTER TABLE appeal_assists
  ADD CONSTRAINT appeal_assists_claim_check
  CHECK (claim IN ('system_not_working', 'sick', 'road_closed', 'on_leave', 'unclear'));

COMMENT ON CONSTRAINT appeal_assists_claim_check ON appeal_assists IS
  'Claims the assist knows how to route. Widening this is a prerequisite for '
  'adding a claim type, not an afterthought — the code fails closed and quietly '
  'without it.';
