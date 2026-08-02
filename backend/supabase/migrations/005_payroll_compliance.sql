-- ── Compliance-grade, human-gated payroll ───────────────────────────────────
-- Calculate-and-prepare only: no money is ever moved. Adds a per-employee pay
-- model, an owner payroll PIN, approval/lock fields on runs, full per-figure
-- provenance + flags on payslips, and an immutable adjustments audit log.
--
-- Safe to re-run.

-- 1) Per-employee pay model. monthly uses base_salary; daily/hourly use pay_rate.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS pay_type text NOT NULL DEFAULT 'monthly'
  CHECK (pay_type IN ('monthly', 'daily', 'hourly'));
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pay_rate numeric(12,2);

-- 2) Owner payroll approval PIN (bcrypt hash). Required to approve a run.
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS payroll_pin_hash text;

-- 3) Pay runs: draft → flagged → approved(+locked). Keep old values for the
--    superseded flow's rows.
ALTER TABLE pay_cycles DROP CONSTRAINT IF EXISTS pay_cycles_status_check;
ALTER TABLE pay_cycles
  ADD CONSTRAINT pay_cycles_status_check
  CHECK (status IN ('open', 'processing', 'draft', 'flagged', 'approved', 'paid'));
ALTER TABLE pay_cycles ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE pay_cycles ADD COLUMN IF NOT EXISTS approved_by uuid;
ALTER TABLE pay_cycles ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
ALTER TABLE pay_cycles ADD COLUMN IF NOT EXISTS flagged_count int NOT NULL DEFAULT 0;
ALTER TABLE pay_cycles ADD COLUMN IF NOT EXISTS total_net numeric(14,2);
ALTER TABLE pay_cycles ADD COLUMN IF NOT EXISTS employee_count int;

-- 4) Payslip lines: full provenance, flags, owner overrides, and manual payment
--    status. `breakdown` is the authoritative record — no figure without a source.
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS flags jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS held boolean NOT NULL DEFAULT false;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS override_net numeric(12,2);
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS payment_ref text;
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_yet'
  CHECK (payment_status IN ('not_yet', 'paid', 'failed'));

-- 5) Immutable audit log of every owner override/adjustment (who/when/what/why).
CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payslip_id  uuid NOT NULL REFERENCES payslips(id) ON DELETE CASCADE,
  type        text NOT NULL
                CHECK (type IN ('override_net', 'bonus', 'deduction', 'hold', 'unhold', 'flag_resolved')),
  amount      numeric(12,2),
  note        text NOT NULL,                 -- a reason is always required
  created_by  uuid,                          -- owner auth user id
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_adjustments_payslip_idx
  ON payroll_adjustments (payslip_id, created_at);

ALTER TABLE payroll_adjustments ENABLE ROW LEVEL SECURITY;
-- Owner reads adjustments for their own org's payslips (service client writes).
DROP POLICY IF EXISTS "owner reads own payroll adjustments" ON payroll_adjustments;
CREATE POLICY "owner reads own payroll adjustments" ON payroll_adjustments FOR SELECT
  USING (
    payslip_id IN (
      SELECT p.id FROM payslips p
      JOIN employees e ON e.id = p.employee_id
      WHERE e.org_id = get_auth_user_org_id()
    )
  );
