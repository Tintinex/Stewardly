-- V010: Add sync cursor + status tracking to plaid_items
ALTER TABLE plaid_items
  ADD COLUMN IF NOT EXISTS cursor        TEXT,
  ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'active'
                                           CHECK (status IN ('active', 'error', 'item_login_required')),
  ADD COLUMN IF NOT EXISTS error_code    TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
