-- V005: Membership approval workflow, activity tracking, HOA admin tools
-- ─────────────────────────────────────────────────────────────────────

-- Add membership status to owners
ALTER TABLE owners
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'suspended')),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS joined_via_code TEXT;

-- Set existing homeowners to active (they were created before approval workflow)
UPDATE owners SET status = 'active' WHERE status = 'active';

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_owners_status    ON owners(hoa_id, status);
CREATE INDEX IF NOT EXISTS idx_owners_last_seen ON owners(hoa_id, last_seen_at DESC NULLS LAST);

-- ── Membership event audit log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS membership_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id       UUID        NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  owner_id     UUID        NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  event_type   TEXT        NOT NULL
    CHECK (event_type IN ('applied', 'approved', 'rejected', 'suspended', 'reinstated')),
  performed_by UUID        REFERENCES owners(id) ON DELETE SET NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_events_hoa   ON membership_events(hoa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_membership_events_owner ON membership_events(owner_id);

-- ── User activity log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_activity_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id     UUID        NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  owner_id   UUID        REFERENCES owners(id) ON DELETE SET NULL,
  action     TEXT        NOT NULL,
  -- actions: 'login','signup','maintenance_submitted','maintenance_resolved',
  --          'document_uploaded','message_posted','dues_paid','member_approved',
  --          'member_suspended','invite_code_rotated'
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_hoa   ON user_activity_log(hoa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_owner ON user_activity_log(owner_id, created_at DESC);
