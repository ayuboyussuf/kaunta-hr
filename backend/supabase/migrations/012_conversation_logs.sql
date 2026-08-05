-- ─────────────────────────────────────────────────────────────────────────────
-- 012  Conversation logs and traces
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Observability for the appeal assist: what it was given, what it did, what it
-- produced, and how long it took. Rich on behaviour, empty of values.
--
-- Everything written here is scrubbed BEFORE it is written — names, phones,
-- wages, ID numbers and selfie data are replaced by references and tokens on
-- the way in, not cleaned up afterwards. There is no path that writes a raw
-- value and redacts it later; a log that has held a salary for one second has
-- held it, and backups do not forget.
--
-- A note on what is deliberately absent. The usual agent-observability columns
-- — looped, wrong_tool_recovery, reasoning_leak, token counts — are not here,
-- because this assist has no model in it. Nothing loops, nothing reasons, and
-- there is no reasoning to leak. Columns that could only ever read false would
-- suggest a system this is not. What IS measurable is measured: whether the
-- claim could be routed, whether the brief came back empty, whether a tool
-- errored, whether the employee had to be asked for something, and how long it
-- all took.

CREATE TABLE IF NOT EXISTS conversation_logs (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      uuid REFERENCES orgs(id) ON DELETE SET NULL,
  kind        text NOT NULL,
  -- What this was about, as a reference. Never the thing itself.
  subject_ref uuid,

  -- Scrubbed. The structure of the question survives; the values do not.
  input_redacted  text,
  output_redacted text,

  claim       text,
  confidence  text,

  -- Health signals that mean something for a deterministic tool loop.
  tool_calls   integer NOT NULL DEFAULT 0,
  findings     integer NOT NULL DEFAULT 0,
  duration_ms  integer,
  outcome      text NOT NULL
               CHECK (outcome IN ('ready', 'awaiting_employee', 'empty', 'no_subject', 'failed')),
  asked_employee boolean NOT NULL DEFAULT false,
  error_redacted text,

  -- Review. A golden log is one a human has confirmed reads correctly, and is
  -- what a change to the fact-finding gets checked against before it ships.
  is_golden   boolean NOT NULL DEFAULT false,
  note        text,

  engine_version text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- No RLS policy is created on purpose: these tables are reachable only by the
-- service role behind the admin endpoints. An owner must not read them, and a
-- staff member must never come near them.
ALTER TABLE conversation_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS conversation_logs_recent_idx
  ON conversation_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS conversation_logs_triage_idx
  ON conversation_logs (outcome, created_at DESC);
CREATE INDEX IF NOT EXISTS conversation_logs_golden_idx
  ON conversation_logs (is_golden) WHERE is_golden;

-- ── The step-by-step ─────────────────────────────────────────────────────────
--
-- One row per step: which tool ran, what it returned in shape, how long it
-- took. Admin-only and scrubbed like everything else.

CREATE TABLE IF NOT EXISTS conversation_traces (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  log_id      uuid NOT NULL REFERENCES conversation_logs(id) ON DELETE CASCADE,
  seq         integer NOT NULL,
  step        text NOT NULL,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_ms integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE conversation_traces ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS conversation_traces_log_idx
  ON conversation_traces (log_id, seq);

COMMENT ON TABLE conversation_logs IS
  'Admin-only. Scrubbed before write — never contains a name, phone, wage, ID or selfie.';
