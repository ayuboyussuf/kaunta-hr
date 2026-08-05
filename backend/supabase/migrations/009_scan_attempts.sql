-- ─────────────────────────────────────────────────────────────────────────────
-- 009  Scan attempts that did not become attendance
-- ─────────────────────────────────────────────────────────────────────────────
--
-- attendance_entries records scans that worked. Nothing recorded the ones that
-- did not, so "the app wouldn't let me clock in" was unanswerable in both
-- directions: the employee couldn't show they tried, and the owner couldn't
-- show they didn't.
--
-- Two sources write here:
--   server — the backend rejected the scan (expired QR, wrong site, rotated
--            code, an error on our side). We know exactly what happened.
--   client — the phone never got that far (camera blocked, no signal, GPS
--            refused). Reported by the app, queued until it can reach us.
--
-- A client-reported row is a claim, not proof, and the `source` column keeps
-- that distinction visible to anyone reading the record later.
--
-- No free text is accepted from the device: the outcome is a fixed vocabulary,
-- and any detail is written by the server. There is nothing here for a name, a
-- phone number or an amount to leak into.

CREATE TABLE IF NOT EXISTS scan_attempts (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  employee_id  uuid REFERENCES employees(id) ON DELETE SET NULL,
  workplace_id uuid REFERENCES workplaces(id) ON DELETE SET NULL,

  source       text NOT NULL CHECK (source IN ('server', 'client')),
  outcome      text NOT NULL CHECK (outcome IN (
                 -- server-side rejections
                 'invalid_token', 'wrong_workplace', 'rotated_qr',
                 'employee_not_found', 'server_error',
                 -- client-side failures the server never saw
                 'camera_blocked', 'camera_failed', 'network_error',
                 'location_denied', 'unreadable_qr'
               )),
  -- server-authored only; never echoed from the device
  detail       text,

  lat          double precision,
  lng          double precision,
  accuracy_m   double precision,
  -- when it happened on the device; may predate created_at for queued reports
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scan_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads scan attempts" ON scan_attempts FOR SELECT
  USING (org_id = get_auth_user_org_id());

-- "did this person try, and when" — the appeal question
CREATE INDEX IF NOT EXISTS scan_attempts_emp_idx
  ON scan_attempts (employee_id, occurred_at DESC);
-- "was the site working at that hour" — the corroboration question
CREATE INDEX IF NOT EXISTS scan_attempts_site_idx
  ON scan_attempts (workplace_id, occurred_at DESC);

COMMENT ON TABLE scan_attempts IS
  'Scans that did not become attendance. server rows are what we observed; client rows are what the device reported.';
