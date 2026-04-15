-- Stewardly Dev/Staging Seed Data
-- Run only in dev/staging environments
-- DO NOT run in production

-- ─── HOA ─────────────────────────────────────────────────────────────────────
INSERT INTO hoas (id, name, address, city, state, zip, unit_count, timezone, subscription_tier)
VALUES (
  'a1b2c3d4-0001-0001-0001-000000000001',
  'Maple Ridge HOA',
  '100 Maple Ridge Drive',
  'Raleigh',
  'NC',
  '27609',
  24,
  'America/New_York',
  'growth'
);

-- ─── Units (24 units) ────────────────────────────────────────────────────────
INSERT INTO units (id, hoa_id, unit_number, address, sqft, bedrooms, bathrooms)
SELECT
  gen_random_uuid(),
  'a1b2c3d4-0001-0001-0001-000000000001',
  n::TEXT,
  (100 + n)::TEXT || ' Maple Ridge Drive',
  1200 + (n % 5) * 150,
  2 + (n % 3),
  2.0
FROM generate_series(1, 24) AS n;

-- ─── Owners / Residents (8) ──────────────────────────────────────────────────
-- Note: cognito_sub would be populated by the Cognito pre-token Lambda on first sign-in

-- Board Admin
INSERT INTO owners (id, hoa_id, email, first_name, last_name, role, unit_id, phone)
SELECT
  'b1000001-0000-0000-0000-000000000001',
  'a1b2c3d4-0001-0001-0001-000000000001',
  'sarah.chen@example.com',
  'Sarah',
  'Chen',
  'board_admin',
  (SELECT id FROM units WHERE hoa_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND unit_number = '1'),
  '(919) 555-0101';

-- Board Members
INSERT INTO owners (id, hoa_id, email, first_name, last_name, role, unit_id, phone)
SELECT
  'b1000002-0000-0000-0000-000000000002',
  'a1b2c3d4-0001-0001-0001-000000000001',
  'marcus.johnson@example.com',
  'Marcus',
  'Johnson',
  'board_member',
  (SELECT id FROM units WHERE hoa_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND unit_number = '4'),
  '(919) 555-0102';

INSERT INTO owners (id, hoa_id, email, first_name, last_name, role, unit_id, phone)
SELECT
  'b1000003-0000-0000-0000-000000000003',
  'a1b2c3d4-0001-0001-0001-000000000001',
  'priya.patel@example.com',
  'Priya',
  'Patel',
  'board_member',
  (SELECT id FROM units WHERE hoa_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND unit_number = '7'),
  '(919) 555-0103';

-- Homeowners
INSERT INTO owners (id, hoa_id, email, first_name, last_name, role, unit_id, phone)
VALUES
  (
    'b1000004-0000-0000-0000-000000000004',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'david.okafor@example.com', 'David', 'Okafor', 'homeowner',
    (SELECT id FROM units WHERE hoa_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND unit_number = '10'),
    '(919) 555-0104'
  ),
  (
    'b1000005-0000-0000-0000-000000000005',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'elena.rodriguez@example.com', 'Elena', 'Rodriguez', 'homeowner',
    (SELECT id FROM units WHERE hoa_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND unit_number = '13'),
    '(919) 555-0105'
  ),
  (
    'b1000006-0000-0000-0000-000000000006',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'james.whitfield@example.com', 'James', 'Whitfield', 'homeowner',
    (SELECT id FROM units WHERE hoa_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND unit_number = '16'),
    '(919) 555-0106'
  ),
  (
    'b1000007-0000-0000-0000-000000000007',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'aisha.washington@example.com', 'Aisha', 'Washington', 'homeowner',
    (SELECT id FROM units WHERE hoa_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND unit_number = '19'),
    '(919) 555-0107'
  ),
  (
    'b1000008-0000-0000-0000-000000000008',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'tom.nguyen@example.com', 'Tom', 'Nguyen', 'homeowner',
    (SELECT id FROM units WHERE hoa_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND unit_number = '22'),
    '(919) 555-0108'
  );

-- ─── Tasks ────────────────────────────────────────────────────────────────────
INSERT INTO tasks (id, hoa_id, title, description, status, priority, assignee_id, due_date, created_by_id)
VALUES
  (
    gen_random_uuid(),
    'a1b2c3d4-0001-0001-0001-000000000001',
    'Repair parking lot pothole near Building B',
    'Large pothole at the entrance of Building B parking lot. Safety hazard.',
    'in_progress', 'high',
    'b1000002-0000-0000-0000-000000000002',
    '2024-08-15',
    'b1000001-0000-0000-0000-000000000001'
  ),
  (
    gen_random_uuid(),
    'a1b2c3d4-0001-0001-0001-000000000001',
    'Schedule pool chemical inspection',
    'Annual pool chemical balance inspection due by end of month.',
    'todo', 'medium',
    'b1000003-0000-0000-0000-000000000003',
    '2024-07-31',
    'b1000001-0000-0000-0000-000000000001'
  ),
  (
    gen_random_uuid(),
    'a1b2c3d4-0001-0001-0001-000000000001',
    'Update HOA bylaws document on portal',
    'Post the newly approved 2024 bylaws to the resident portal.',
    'todo', 'medium',
    'b1000001-0000-0000-0000-000000000001',
    '2024-08-01',
    'b1000001-0000-0000-0000-000000000001'
  ),
  (
    gen_random_uuid(),
    'a1b2c3d4-0001-0001-0001-000000000001',
    'Replace lobby light fixtures in Building A',
    '3 fixtures burned out in the main lobby.',
    'done', 'low',
    'b1000002-0000-0000-0000-000000000002',
    '2024-07-10',
    'b1000002-0000-0000-0000-000000000002'
  );

-- ─── Meetings ────────────────────────────────────────────────────────────────
INSERT INTO meetings (id, hoa_id, title, scheduled_at, location, status, created_by_id)
VALUES
  (
    'c1000001-0000-0000-0000-000000000001',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'Monthly Board Meeting — August 2024',
    '2024-08-06 18:30:00+00',
    'Community Room B, 100 Maple Ridge Drive',
    'scheduled',
    'b1000001-0000-0000-0000-000000000001'
  ),
  (
    'c1000002-0000-0000-0000-000000000002',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'Monthly Board Meeting — July 2024',
    '2024-07-09 18:30:00+00',
    'Community Room B, 100 Maple Ridge Drive',
    'completed',
    'b1000001-0000-0000-0000-000000000001'
  );

-- Agenda items for August meeting
INSERT INTO meeting_agenda_items (id, meeting_id, hoa_id, "order", title, duration_minutes)
VALUES
  (gen_random_uuid(), 'c1000001-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0001-0001-000000000001', 1, 'Call to Order & Quorum Check', 5),
  (gen_random_uuid(), 'c1000001-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0001-0001-000000000001', 2, 'Approval of July Minutes', 10),
  (gen_random_uuid(), 'c1000001-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0001-0001-000000000001', 3, 'Financial Report — Q2 Review', 20),
  (gen_random_uuid(), 'c1000001-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0001-0001-000000000001', 4, 'Parking Lot Repair Update', 15),
  (gen_random_uuid(), 'c1000001-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0001-0001-000000000001', 5, 'Open Forum — Resident Questions', 20);

-- Update July meeting with minutes
UPDATE meetings
SET minutes = 'MINUTES OF THE MAPLE RIDGE HOA BOARD MEETING
July 9, 2024 — 6:30 PM

MEMBERS PRESENT: Sarah Chen, Marcus Johnson, Priya Patel

FINANCIAL REPORT: Monthly dues collection at 96%. Reserve fund balance at $182,400.

POOL SAFETY UPDATES: Annual inspection recommended by July 31.

ADJOURNMENT: Meeting adjourned at 7:48 PM.'
WHERE id = 'c1000002-0000-0000-0000-000000000002';

-- ─── Boards ──────────────────────────────────────────────────────────────────
INSERT INTO boards (id, hoa_id, name, description, visibility)
VALUES
  (
    'd1000001-0000-0000-0000-000000000001',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'Community Wide',
    'Announcements and discussions for all Maple Ridge residents',
    'community_wide'
  ),
  (
    'd1000002-0000-0000-0000-000000000002',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'Board Only',
    'Private board member communications',
    'board_only'
  ),
  (
    'd1000003-0000-0000-0000-000000000003',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'Maintenance Requests',
    'Submit and track community maintenance issues',
    'community_wide'
  );

-- Threads
INSERT INTO threads (id, board_id, hoa_id, title, author_id, pinned)
VALUES
  (
    'e1000001-0000-0000-0000-000000000001',
    'd1000001-0000-0000-0000-000000000001',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'Pool Hours Update — Summer 2024',
    'b1000001-0000-0000-0000-000000000001',
    TRUE
  ),
  (
    'e1000002-0000-0000-0000-000000000002',
    'd1000001-0000-0000-0000-000000000001',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'Annual BBQ — August 17th!',
    'b1000005-0000-0000-0000-000000000005',
    FALSE
  );

-- Posts
INSERT INTO posts (id, thread_id, hoa_id, author_id, body, created_at)
VALUES
  (
    gen_random_uuid(),
    'e1000001-0000-0000-0000-000000000001',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'b1000001-0000-0000-0000-000000000001',
    'Hi Maple Ridge community! Effective July 1st, summer pool hours are 7:00 AM – 10:00 PM daily. Please ensure all guests are accompanied by a resident. Enjoy the summer!',
    '2024-07-01 10:00:00+00'
  ),
  (
    gen_random_uuid(),
    'e1000002-0000-0000-0000-000000000002',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'b1000005-0000-0000-0000-000000000005',
    'Exciting news — the annual Maple Ridge BBQ is on! Saturday, August 17th from 2 PM to 7 PM at the main pavilion. Families welcome!',
    '2024-07-18 09:00:00+00'
  );

-- ─── Finances ────────────────────────────────────────────────────────────────
-- Budget
INSERT INTO budgets (id, hoa_id, fiscal_year, total_amount)
VALUES (
  'f1000001-0000-0000-0000-000000000001',
  'a1b2c3d4-0001-0001-0001-000000000001',
  2024,
  143200.00
);

-- Budget line items
INSERT INTO budget_line_items (id, budget_id, hoa_id, category, description, budgeted_amount, actual_amount)
VALUES
  (gen_random_uuid(), 'f1000001-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0001-0001-000000000001', 'Landscaping',   'Lawn care, trimming, seasonal planting', 18000.00, 16800.00),
  (gen_random_uuid(), 'f1000001-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0001-0001-000000000001', 'Pool & Amenities', 'Pool maintenance, chemicals, equipment', 12000.00, 11200.00),
  (gen_random_uuid(), 'f1000001-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0001-0001-000000000001', 'Insurance',     'Property & liability insurance', 34800.00, 34800.00),
  (gen_random_uuid(), 'f1000001-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0001-0001-000000000001', 'Utilities',     'Electric, water, trash for common areas', 14400.00, 15200.00),
  (gen_random_uuid(), 'f1000001-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0001-0001-000000000001', 'Maintenance',   'General repairs and maintenance', 22000.00, 18340.00),
  (gen_random_uuid(), 'f1000001-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0001-0001-000000000001', 'Management',    'Property management software & admin', 6000.00, 5400.00),
  (gen_random_uuid(), 'f1000001-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0001-0001-000000000001', 'Legal & Audit', 'Legal fees and annual audit', 8000.00, 4200.00),
  (gen_random_uuid(), 'f1000001-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0001-0001-000000000001', 'Reserve Contribution', 'Monthly contribution to reserve fund', 28000.00, 28000.00);

-- Bank accounts
INSERT INTO accounts (id, hoa_id, institution_name, account_name, account_type, balance, last_synced_at)
VALUES
  (
    'ac000001-0000-0000-0000-000000000001',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'First Citizens Bank',
    'HOA Operating Account',
    'checking',
    94720.00,
    NOW()
  ),
  (
    'ac000002-0000-0000-0000-000000000002',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'First Citizens Bank',
    'HOA Reserve Fund',
    'savings',
    182400.00,
    NOW()
  );

-- Recent transactions
INSERT INTO transactions (id, hoa_id, account_id, amount, description, category, date, type)
VALUES
  (gen_random_uuid(), 'a1b2c3d4-0001-0001-0001-000000000001', 'ac000001-0000-0000-0000-000000000001', -3200.00,  'Green Thumb Landscaping — July',    'Landscaping',      '2024-07-15', 'debit'),
  (gen_random_uuid(), 'a1b2c3d4-0001-0001-0001-000000000001', 'ac000001-0000-0000-0000-000000000001', -1840.00,  'Duke Energy — Common Areas',        'Utilities',        '2024-07-12', 'debit'),
  (gen_random_uuid(), 'a1b2c3d4-0001-0001-0001-000000000001', 'ac000001-0000-0000-0000-000000000001',  48200.00, 'Monthly Dues Collection — July',    'Income',           '2024-07-01', 'credit'),
  (gen_random_uuid(), 'a1b2c3d4-0001-0001-0001-000000000001', 'ac000001-0000-0000-0000-000000000001', -980.00,   'Aqua Pool Services — Monthly',      'Pool & Amenities', '2024-07-08', 'debit'),
  (gen_random_uuid(), 'a1b2c3d4-0001-0001-0001-000000000001', 'ac000001-0000-0000-0000-000000000001', -450.00,   'City of Raleigh — Trash Collection', 'Utilities',       '2024-07-05', 'debit'),
  (gen_random_uuid(), 'a1b2c3d4-0001-0001-0001-000000000001', 'ac000001-0000-0000-0000-000000000001', -2900.00,  'ABC Asphalt — Pothole Estimate',    'Maintenance',      '2024-07-22', 'debit'),
  (gen_random_uuid(), 'a1b2c3d4-0001-0001-0001-000000000001', 'ac000002-0000-0000-0000-000000000002',  2500.00,  'Reserve Fund Contribution — July',  'Reserve',          '2024-07-01', 'credit');

-- Monthly assessments (dues) for current residents
INSERT INTO assessments (id, hoa_id, unit_id, amount, due_date, paid_date, status)
SELECT
  gen_random_uuid(),
  'a1b2c3d4-0001-0001-0001-000000000001',
  u.id,
  2008.33,  -- $48,200 / 24 units
  '2024-07-01',
  CASE WHEN u.unit_number NOT IN ('10', '15') THEN '2024-07-01'::date ELSE NULL END,
  CASE WHEN u.unit_number NOT IN ('10', '15') THEN 'paid' ELSE 'pending' END
FROM units u
WHERE u.hoa_id = 'a1b2c3d4-0001-0001-0001-000000000001';

-- ─── Subscription ────────────────────────────────────────────────────────────
INSERT INTO subscriptions (id, hoa_id, tier, status, trial_ends_at)
VALUES (
  gen_random_uuid(),
  'a1b2c3d4-0001-0001-0001-000000000001',
  'growth',
  'trialing',
  NOW() + INTERVAL '14 days'
);
