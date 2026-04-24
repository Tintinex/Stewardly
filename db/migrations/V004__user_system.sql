-- Stewardly V004 — User/Resident System
-- Adds: invite_codes, documents, maintenance_requests
-- Also: description column on assessments

-- ─── Invite Codes ─────────────────────────────────────────────────────────────
CREATE TABLE invite_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id       UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  code         TEXT NOT NULL UNIQUE,
  created_by   UUID REFERENCES owners(id) ON DELETE SET NULL,
  expires_at   TIMESTAMPTZ,          -- NULL = never expires
  max_uses     INT DEFAULT NULL,     -- NULL = unlimited
  used_count   INT NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invite_codes_hoa_active ON invite_codes(hoa_id, is_active);
CREATE INDEX idx_invite_codes_code ON invite_codes(code);

-- ─── Documents ────────────────────────────────────────────────────────────────
CREATE TABLE documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id           UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  category         TEXT NOT NULL DEFAULT 'general'
                     CHECK (category IN ('general', 'financial', 'legal', 'meeting_minutes', 'rules', 'forms')),
  file_url         TEXT NOT NULL,
  file_name        TEXT NOT NULL,
  file_size_bytes  INT,
  uploaded_by      UUID REFERENCES owners(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_hoa_id ON documents(hoa_id);
CREATE INDEX idx_documents_hoa_category ON documents(hoa_id, category);

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Maintenance Requests ─────────────────────────────────────────────────────
CREATE TABLE maintenance_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id        UUID NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  unit_id       UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  submitted_by  UUID REFERENCES owners(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL DEFAULT 'general'
                  CHECK (category IN ('plumbing', 'electrical', 'hvac', 'structural', 'landscaping', 'pest_control', 'common_area', 'other')),
  priority      TEXT NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low', 'normal', 'urgent')),
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maintenance_requests_hoa_id ON maintenance_requests(hoa_id);
CREATE INDEX idx_maintenance_requests_hoa_status ON maintenance_requests(hoa_id, status);
CREATE INDEX idx_maintenance_requests_unit_id ON maintenance_requests(unit_id);

CREATE TRIGGER maintenance_requests_updated_at
  BEFORE UPDATE ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Assessments: add description column ─────────────────────────────────────
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS description TEXT;
