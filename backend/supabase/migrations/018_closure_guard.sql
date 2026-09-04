-- ─────────────────────────────────────────────────────────────────────────────
-- 018  Never fine a whole site for a day nobody has explained
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The absence sweep asks one question per employee: was there a scan? If not,
-- it raises the absence rule and sends the notice. Applied to a public holiday
-- that produces, at 21:30, an SMS to every member of staff telling them they
-- were absent and have been charged — plus an appeal window on each, plus a
-- queue of appeals for the owner, for a day the business was shut.
--
-- The premise is what is wrong. Zero scans at a site with several people
-- rostered is not evidence that they all independently decided not to come. The
-- likelier explanations are a holiday, a closure, a network outage, or a QR code
-- that fell off the wall — and in every one of those, fining people is unjust.
--
-- So the sweep now refuses to act on a day it cannot explain. It HOLDS the
-- absences, asks the owner what happened, and acts on the answer. If nobody ever
-- answers, the held penalties are discarded: the burden of asserting that eleven
-- people were absent belongs to whoever is claiming it, and silence is not that
-- assertion. It is the only default that cannot quietly take money.
--
-- Two tables. One prevents (days declared closed in advance), one catches
-- (days that turned out empty and nobody warned us about).

-- ── Declared non-working days ───────────────────────────────────────────────
--
-- Deliberately NOT a built-in Kenyan holiday calendar. Gazetted days move, Eid
-- depends on sighting, proclamations happen at short notice — and fuel
-- stations, restaurants and security firms work straight through most of them.
-- A built-in calendar would be wrong in both directions. The owner knows which
-- days their business is shut; nothing else does.
--
-- workplace_id NULL means the whole organisation.
CREATE TABLE IF NOT EXISTS non_working_days (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  workplace_id uuid REFERENCES workplaces(id) ON DELETE CASCADE,

  on_date      date NOT NULL,
  -- "Madaraka Day", "Stock take", "Closed for renovation".
  label        text NOT NULL,
  -- Whether staff are paid for it. Absence enforcement is suppressed either
  -- way; this only tells payroll how to treat the day.
  paid         boolean NOT NULL DEFAULT true,

  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- One declaration per day per scope. The partial indexes are needed because
-- NULL never equals NULL, so a plain UNIQUE would allow duplicate org-wide rows.
CREATE UNIQUE INDEX IF NOT EXISTS non_working_days_site_uniq
  ON non_working_days (org_id, workplace_id, on_date) WHERE workplace_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS non_working_days_org_uniq
  ON non_working_days (org_id, on_date) WHERE workplace_id IS NULL;
CREATE INDEX IF NOT EXISTS non_working_days_lookup_idx
  ON non_working_days (org_id, on_date);

ALTER TABLE non_working_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages non-working days" ON non_working_days FOR ALL
  USING (org_id = get_auth_user_org_id()) WITH CHECK (org_id = get_auth_user_org_id());

COMMENT ON TABLE non_working_days IS
  'Days the owner has declared the business (or one site) closed. Absence '
  'enforcement is skipped entirely for these, and payroll reads `paid`.';

-- ── Days that came back empty ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS closure_reviews (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  workplace_id uuid REFERENCES workplaces(id) ON DELETE CASCADE,
  on_date      date NOT NULL,

  -- The counts that triggered it, kept so the question can state its evidence
  -- rather than asking the owner to take its word for it.
  rostered        integer NOT NULL,
  scanned         integer NOT NULL DEFAULT 0,
  -- Failed clock-in attempts the phones reported. When this is high the answer
  -- is usually obvious and is not "everyone stayed home".
  failed_attempts integer NOT NULL DEFAULT 0,

  status text NOT NULL DEFAULT 'pending'
         CHECK (status IN ('pending', 'closed', 'worked', 'expired')),

  -- Which way the owner answered, or how it resolved on its own.
  --   closed_holiday  : a public holiday or declared closure
  --   closed_other    : shut for some other reason
  --   system_problem  : the site or the app was not working
  --   everyone_absent : the owner asserts nobody turned up; penalties are raised
  --   expired         : nobody answered inside the window; penalties discarded
  resolution text
         CHECK (resolution IS NULL OR resolution IN
               ('closed_holiday', 'closed_other', 'system_problem',
                'everyone_absent', 'expired')),
  note        text,
  resolved_by uuid,
  resolved_at timestamptz,

  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS closure_reviews_site_day_uniq
  ON closure_reviews (org_id, workplace_id, on_date) WHERE workplace_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS closure_reviews_org_day_uniq
  ON closure_reviews (org_id, on_date) WHERE workplace_id IS NULL;
CREATE INDEX IF NOT EXISTS closure_reviews_pending_idx
  ON closure_reviews (org_id, status, on_date DESC);

ALTER TABLE closure_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages closure reviews" ON closure_reviews FOR ALL
  USING (org_id = get_auth_user_org_id()) WITH CHECK (org_id = get_auth_user_org_id());

COMMENT ON TABLE closure_reviews IS
  'A site-day where nobody clocked in. Absence penalties are HELD, not raised, '
  'until the owner says what happened. Unanswered after the window, the held '
  'penalties are discarded rather than applied.';
