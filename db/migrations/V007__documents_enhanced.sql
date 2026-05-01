-- V007: Enhanced document management
-- Adds S3 key storage, expanded categories, source tracking, and email/Drive support

-- 1. Expand category CHECK constraint to include HOA-specific categories
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_category_check;
ALTER TABLE documents ADD CONSTRAINT documents_category_check
  CHECK (category IN (
    'general', 'bylaws', 'financial', 'budget', 'receipts',
    'legal', 'contracts', 'sow', 'meeting_minutes',
    'rules', 'forms', 'notices', 'insurance'
  ));

-- 2. S3 object key — used to generate presigned download URLs on the fly
--    Allows serving private S3 files without storing expiring URLs in the DB
ALTER TABLE documents ADD COLUMN IF NOT EXISTS s3_key TEXT;

-- 3. Document source
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'upload'
  CONSTRAINT documents_source_check
  CHECK (source IN ('upload', 'google_drive', 'email'));

-- 4. Processing/indexing status (reserved for future Textract integration)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'done'
  CONSTRAINT documents_processing_status_check
  CHECK (processing_status IN ('pending', 'processing', 'done', 'error'));

-- 5. MIME type for accurate icon/preview rendering
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_type TEXT;

-- 6. Auto-detected category from filename/content analysis
ALTER TABLE documents ADD COLUMN IF NOT EXISTS auto_category TEXT;

-- 7. For email uploads: sender address
ALTER TABLE documents ADD COLUMN IF NOT EXISTS email_sender TEXT;

-- 8. For Google Drive imports: original share URL
ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_url TEXT;

-- 9. Full-text content for Phase 2 AI search (populated by Textract processor)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_text TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS text_extracted_at TIMESTAMPTZ;

-- 10. Soft-delete support
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_documents_deleted ON documents(hoa_id, deleted_at) WHERE deleted_at IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_source           ON documents(hoa_id, source);
CREATE INDEX IF NOT EXISTS idx_documents_processing       ON documents(processing_status) WHERE processing_status != 'done';
CREATE INDEX IF NOT EXISTS idx_documents_text_search      ON documents USING gin(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(extracted_text, '')));
