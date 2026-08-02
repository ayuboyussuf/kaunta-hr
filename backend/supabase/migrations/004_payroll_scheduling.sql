-- ── Agentic payroll: cadence config + draft/release cycles ───────────────────
-- Adds owner payroll cadence, and widens pay cycles to support a "draft" state
-- (computed but not yet released to employees) plus a per-workplace summary PDF.
--
-- Safe to re-run.

-- 1) Per-org payroll cadence. 'off' = manual only (the default, unchanged
--    behaviour). pay_day: monthly = day-of-month (1..28; >28 or null = month-end);
--    weekly/biweekly = day-of-week (0=Sun..6=Sat). last_period guards the cron
--    against running the same period twice (e.g. '2026-08' or '2026-W32').
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS payroll_cadence text NOT NULL DEFAULT 'off'
  CHECK (payroll_cadence IN ('off', 'weekly', 'biweekly', 'monthly'));
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS payroll_pay_day int;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS payroll_last_period text;

-- 2) Pay cycles: allow a 'draft' status (run computed it, owner hasn't released
--    payslips yet), record when it was released, whether the cron created it, and
--    the per-workplace payout summary PDF.
ALTER TABLE pay_cycles DROP CONSTRAINT IF EXISTS pay_cycles_status_check;
ALTER TABLE pay_cycles
  ADD CONSTRAINT pay_cycles_status_check
  CHECK (status IN ('open', 'processing', 'draft', 'paid'));
ALTER TABLE pay_cycles ADD COLUMN IF NOT EXISTS released_at timestamptz;
ALTER TABLE pay_cycles ADD COLUMN IF NOT EXISTS auto boolean NOT NULL DEFAULT false;
ALTER TABLE pay_cycles ADD COLUMN IF NOT EXISTS summary_pdf_url text;
