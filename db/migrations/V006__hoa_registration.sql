-- V006: HOA Self-Registration Support
-- Creates default boards for new HOAs on initial setup.
-- This migration is a no-op schema change — it adds a trigger that
-- auto-creates default message boards when a new HOA is inserted.

-- Default boards created for every new HOA: General, Announcements, Board Only
CREATE OR REPLACE FUNCTION create_default_boards()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO boards (id, hoa_id, name, description, visibility) VALUES
    (gen_random_uuid(), NEW.id, 'General',       'Community-wide discussion',        'community_wide'),
    (gen_random_uuid(), NEW.id, 'Announcements', 'Official announcements from board','community_wide'),
    (gen_random_uuid(), NEW.id, 'Board Only',    'Private board member discussions', 'board_only');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hoas_create_default_boards
  AFTER INSERT ON hoas
  FOR EACH ROW
  EXECUTE FUNCTION create_default_boards();
