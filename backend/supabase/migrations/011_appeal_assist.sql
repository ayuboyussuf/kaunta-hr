-- ─────────────────────────────────────────────────────────────────────────────
-- 011  Appeal assist
-- ─────────────────────────────────────────────────────────────────────────────
--
-- When someone appeals a penalty, the owner currently gets a sentence and a
-- decision to make. Everything that would help them — whether the site was
-- working that morning, whether this person's phone reported failures, whether
-- they have said the same thing before — is in the database and nobody looks.
--
-- This holds what was found. Note what is NOT here: there is no verdict column,
-- no recommendation, no score. The assist gathers, checks and summarises; the
-- employer decides. Adding a "suggested outcome" column later would change what
-- this is, and the absence of one is the design.

CREATE TABLE IF NOT EXISTS appeal_assists (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  appeal_id  uuid NOT NULL UNIQUE REFERENCES appeals(id) ON DELETE CASCADE,
  org_id     uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,

  -- What the employee appears to be claiming. Routing only — never a fact.
  claim      text NOT NULL CHECK (claim IN
               ('system_not_working', 'sick', 'road_closed', 'unclear')),
  confidence text NOT NULL CHECK (confidence IN ('high', 'low')),

  status     text NOT NULL DEFAULT 'ready'
             CHECK (status IN ('ready', 'awaiting_employee', 'failed')),

  -- Each finding carries the counts it came from, so the owner can check it.
  findings   jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Plain-language recap, assembled from the findings. Never a conclusion.
  summary    text,
  -- What would settle this that we do not have.
  missing    jsonb NOT NULL DEFAULT '[]'::jsonb,

  engine_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE appeal_assists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads appeal assists" ON appeal_assists FOR SELECT
  USING (org_id = get_auth_user_org_id());

-- ── The one question, when there is one ──────────────────────────────────────
--
-- Not a conversation. If the assist needs one specific thing it cannot get
-- from the record, the employee is asked for that one thing by SMS, with a link
-- back to the dashboard — and "I can't provide this" is always an answer, not a
-- dead end. Nothing is asked twice.

CREATE TABLE IF NOT EXISTS appeal_info_requests (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  assist_id   uuid NOT NULL REFERENCES appeal_assists(id) ON DELETE CASCADE,
  appeal_id   uuid NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  ask_code    text NOT NULL CHECK (ask_code IN ('which_road', 'sick_note')),
  -- Exactly what the employee was asked, kept verbatim so the record shows the
  -- question they were answering.
  question    text NOT NULL,

  asked_at    timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  answer      text,
  -- The "not applicable / I can't provide this" route. Declining is an answer.
  declined    boolean NOT NULL DEFAULT false,
  document_path text
);

ALTER TABLE appeal_info_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads appeal info requests" ON appeal_info_requests FOR SELECT
  USING (assist_id IN (SELECT id FROM appeal_assists WHERE org_id = get_auth_user_org_id()));

CREATE INDEX IF NOT EXISTS appeal_info_requests_emp_idx
  ON appeal_info_requests (employee_id, answered_at);

COMMENT ON TABLE appeal_assists IS
  'Fact-finding for an appeal. Deliberately has no verdict column — the employer decides.';
