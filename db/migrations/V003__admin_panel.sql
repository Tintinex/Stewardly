-- ─── Admin Panel Support ──────────────────────────────────────────────────────
-- Audit log for all destructive superadmin actions (compliance requirement)

CREATE TABLE IF NOT EXISTS superadmin_audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   TEXT        NOT NULL,
  action          TEXT        NOT NULL,   -- e.g. UPDATE_HOA, DISABLE_USER, RESET_PASSWORD
  target_type     TEXT        NOT NULL,   -- e.g. hoa, user
  target_id       TEXT        NOT NULL,
  payload_json    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_admin     ON superadmin_audit_log (admin_user_id);
CREATE INDEX idx_audit_log_target    ON superadmin_audit_log (target_type, target_id);
CREATE INDEX idx_audit_log_created   ON superadmin_audit_log (created_at DESC);

-- ─── Subscriptions table (if not already present) ────────────────────────────
-- Admin stats and billing pages depend on this table.

CREATE TABLE IF NOT EXISTS subscriptions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id              UUID        NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  tier                TEXT        NOT NULL DEFAULT 'starter',  -- starter, growth, enterprise
  status              TEXT        NOT NULL DEFAULT 'trialing', -- trialing, active, past_due, cancelled
  trial_ends_at       TIMESTAMPTZ,
  current_period_end  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_hoa ON subscriptions (hoa_id);
