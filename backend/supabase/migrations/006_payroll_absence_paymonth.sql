-- ── Payroll fixes: hire date, absence policy, pay-month ──────────────────────
-- 1) Only measure attendance from when an employee actually joined (avoids
--    flagging days before they were on the system).
-- 2) Let the owner choose how monthly absence affects pay.
-- 3) Let the owner choose whether a monthly run pays the previous or current month.
--
-- Safe to re-run.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS start_date date;

ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS absence_policy text NOT NULL DEFAULT 'flat'
  CHECK (absence_policy IN ('flat', 'prorate'));

ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS payroll_pay_month text NOT NULL DEFAULT 'previous'
  CHECK (payroll_pay_month IN ('previous', 'current'));
