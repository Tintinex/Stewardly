-- Stewardly Phase 0 — Initial Schema
-- PostgreSQL 15.4
-- Run via Migration Lambda or psql

-- ─── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Utility: updated_at trigger ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── HOAs ─────────────────────────────────────────────────────────────────────
CREATE TABLE hoas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  address             TEXT NOT NULL DEFAULT '',
  city                TEXT NOT NULL DEFAULT '',
  state               CHAR(2) NOT NULL DEFAULT '',
  zip                 VARCHAR(10) NOT NULL DEFAULT '',
  unit_count          INTEGER NOT NULL DEFAULT 0,
  timezone            TEXT NOT NULL DEFAULT 'America/New_York',
  subscription_tier   TEXT NOT NULL DEFAULT 'starter'
                        CHECK (subscription_tier IN ('starter', 'growth', 'enterprise')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER hoas_updated_at
  BEFORE UPDATE ON hoas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Units ────────────────────────────────────────────────────────────────────
CREATE TABLE units (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id        UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  unit_number   TEXT NOT NULL,
  address       TEXT NOT NULL DEFAULT '',
  sqft          INTEGER,
  bedrooms      SMALLINT,
  bathrooms     NUMERIC(3,1),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hoa_id, unit_number)
);

CREATE INDEX idx_units_hoa_id ON units(hoa_id);

CREATE TRIGGER units_updated_at
  BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Owners / Users ───────────────────────────────────────────────────────────
CREATE TABLE owners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id          UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  cognito_sub     TEXT UNIQUE,
  email           TEXT NOT NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'homeowner'
                    CHECK (role IN ('board_admin', 'board_member', 'homeowner')),
  unit_id         UUID REFERENCES units(id) ON DELETE SET NULL,
  phone           TEXT,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hoa_id, email)
);

CREATE INDEX idx_owners_hoa_id ON owners(hoa_id);
CREATE INDEX idx_owners_unit_id ON owners(unit_id);
CREATE INDEX idx_owners_cognito_sub ON owners(cognito_sub);
CREATE INDEX idx_owners_hoa_email ON owners(hoa_id, email);

CREATE TRIGGER owners_updated_at
  BEFORE UPDATE ON owners
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Tasks ────────────────────────────────────────────────────────────────────
CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id          UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'todo'
                    CHECK (status IN ('todo', 'in_progress', 'done')),
  priority        TEXT NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('low', 'medium', 'high')),
  assignee_id     UUID REFERENCES owners(id) ON DELETE SET NULL,
  due_date        DATE,
  created_by_id   UUID NOT NULL REFERENCES owners(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_hoa_id ON tasks(hoa_id);
CREATE INDEX idx_tasks_hoa_status ON tasks(hoa_id, status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_due_date ON tasks(hoa_id, due_date);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  hoa_id      UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES owners(id),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_comments_hoa_id ON task_comments(hoa_id);
CREATE INDEX idx_task_comments_task_id ON task_comments(task_id);

-- ─── Meetings ────────────────────────────────────────────────────────────────
CREATE TABLE meetings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id          UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  location        TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  minutes         TEXT,
  created_by_id   UUID NOT NULL REFERENCES owners(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meetings_hoa_id ON meetings(hoa_id);
CREATE INDEX idx_meetings_hoa_scheduled ON meetings(hoa_id, scheduled_at DESC);
CREATE INDEX idx_meetings_status ON meetings(hoa_id, status);

CREATE TRIGGER meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE meeting_agenda_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id        UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  hoa_id            UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  "order"           SMALLINT NOT NULL DEFAULT 1,
  title             TEXT NOT NULL,
  duration_minutes  SMALLINT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agenda_items_meeting_id ON meeting_agenda_items(meeting_id);
CREATE INDEX idx_agenda_items_hoa_id ON meeting_agenda_items(hoa_id);

CREATE TABLE action_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id      UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  hoa_id          UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  assignee_id     UUID REFERENCES owners(id) ON DELETE SET NULL,
  due_date        DATE,
  completed       BOOLEAN NOT NULL DEFAULT FALSE,
  linked_task_id  UUID REFERENCES tasks(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_action_items_hoa_id ON action_items(hoa_id);
CREATE INDEX idx_action_items_meeting_id ON action_items(meeting_id);

-- ─── Messaging ───────────────────────────────────────────────────────────────
CREATE TABLE boards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id      UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  visibility  TEXT NOT NULL DEFAULT 'community_wide'
                CHECK (visibility IN ('community_wide', 'board_only')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_boards_hoa_id ON boards(hoa_id);

CREATE TRIGGER boards_updated_at
  BEFORE UPDATE ON boards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  hoa_id      UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  author_id   UUID NOT NULL REFERENCES owners(id),
  pinned      BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_threads_hoa_id ON threads(hoa_id);
CREATE INDEX idx_threads_board_id ON threads(board_id);
CREATE INDEX idx_threads_board_pinned ON threads(board_id, pinned DESC, updated_at DESC);

CREATE TRIGGER threads_updated_at
  BEFORE UPDATE ON threads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  hoa_id      UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES owners(id),
  body        TEXT NOT NULL,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_posts_hoa_id ON posts(hoa_id);
CREATE INDEX idx_posts_thread_id ON posts(thread_id);
CREATE INDEX idx_posts_thread_created ON posts(thread_id, created_at ASC);

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Finances ────────────────────────────────────────────────────────────────
CREATE TABLE plaid_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id          UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  item_id         TEXT NOT NULL UNIQUE,
  access_token    TEXT NOT NULL,  -- encrypted at application layer
  institution_id  TEXT NOT NULL,
  institution_name TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plaid_items_hoa_id ON plaid_items(hoa_id);

CREATE TABLE accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id            UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  plaid_item_id     UUID REFERENCES plaid_items(id) ON DELETE SET NULL,
  plaid_account_id  TEXT UNIQUE,
  institution_name  TEXT NOT NULL DEFAULT '',
  account_name      TEXT NOT NULL,
  account_type      TEXT NOT NULL DEFAULT 'checking',
  balance           NUMERIC(15, 2) NOT NULL DEFAULT 0,
  currency          CHAR(3) NOT NULL DEFAULT 'USD',
  last_synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_hoa_id ON accounts(hoa_id);

CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id          UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plaid_txn_id    TEXT UNIQUE,
  amount          NUMERIC(15, 2) NOT NULL,
  description     TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'Other',
  date            DATE NOT NULL,
  type            TEXT NOT NULL DEFAULT 'debit'
                    CHECK (type IN ('debit', 'credit')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_hoa_id ON transactions(hoa_id);
CREATE INDEX idx_transactions_hoa_date ON transactions(hoa_id, date DESC);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_category ON transactions(hoa_id, category);

CREATE TABLE budgets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id        UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  fiscal_year   SMALLINT NOT NULL,
  total_amount  NUMERIC(15, 2) NOT NULL,
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hoa_id, fiscal_year)
);

CREATE INDEX idx_budgets_hoa_id ON budgets(hoa_id);

CREATE TABLE budget_line_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id       UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  hoa_id          UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  category        TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  budgeted_amount NUMERIC(15, 2) NOT NULL,
  actual_amount   NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_budget_line_items_hoa_id ON budget_line_items(hoa_id);
CREATE INDEX idx_budget_line_items_budget_id ON budget_line_items(budget_id);

CREATE TABLE assessments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id        UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  unit_id       UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  amount        NUMERIC(15, 2) NOT NULL,
  due_date      DATE NOT NULL,
  paid_date     DATE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'overdue')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assessments_hoa_id ON assessments(hoa_id);
CREATE INDEX idx_assessments_unit_id ON assessments(unit_id);
CREATE INDEX idx_assessments_due_date ON assessments(hoa_id, due_date);
CREATE INDEX idx_assessments_status ON assessments(hoa_id, status);

-- ─── Subscriptions ───────────────────────────────────────────────────────────
CREATE TABLE subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id                  UUID NOT NULL UNIQUE REFERENCES hoas(id) ON DELETE CASCADE,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  tier                    TEXT NOT NULL DEFAULT 'starter'
                            CHECK (tier IN ('starter', 'growth', 'enterprise')),
  status                  TEXT NOT NULL DEFAULT 'trialing'
                            CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled')),
  trial_ends_at           TIMESTAMPTZ,
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_hoa_id ON subscriptions(hoa_id);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
