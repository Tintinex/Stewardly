-- V008: AI document processing
-- Adds AI summary, key points, and full-text extraction columns

-- 1. AI-generated plain-language summary (2-3 paragraphs)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_summary TEXT;

-- 2. AI-extracted key points as a JSON array of strings
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_key_points JSONB;

-- 3. Update processing_status default to 'pending' for new rows
--    (existing rows already have 'done' from V007)
ALTER TABLE documents ALTER COLUMN processing_status SET DEFAULT 'pending';

-- 4. Timestamp when AI processing completed
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_processed_at TIMESTAMPTZ;

-- 5. Index for finding documents that need processing
CREATE INDEX IF NOT EXISTS idx_documents_ai_pending
  ON documents(processing_status)
  WHERE processing_status = 'pending' AND deleted_at IS NULL;
