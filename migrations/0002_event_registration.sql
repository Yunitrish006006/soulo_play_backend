CREATE TABLE IF NOT EXISTS participant_profiles (
  user_id INTEGER PRIMARY KEY,
  legal_name TEXT NOT NULL,
  gender TEXT NOT NULL,
  age_range TEXT NOT NULL,
  phone TEXT NOT NULL,
  occupation TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  national_id TEXT NOT NULL,
  emergency_name TEXT NOT NULL,
  emergency_relation TEXT NOT NULL,
  emergency_phone TEXT NOT NULL,
  ig_handle TEXT NOT NULL,
  line_id TEXT NOT NULL,
  nickname TEXT,
  city TEXT,
  diet_type TEXT NOT NULL,
  food_avoidances_json TEXT NOT NULL DEFAULT '[]',
  allergies_text TEXT,
  music_preferences_json TEXT NOT NULL DEFAULT '[]',
  hobbies_text TEXT,
  referral_source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  intro_html TEXT,
  agenda_json TEXT NOT NULL DEFAULT '[]',
  rules_html TEXT,
  refund_policy_html TEXT,
  packing_required_json TEXT NOT NULL DEFAULT '[]',
  packing_recommended_json TEXT NOT NULL DEFAULT '[]',
  pickup_info_json TEXT NOT NULL DEFAULT '{}',
  organizer_ig TEXT,
  organizer_line_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'open', 'closed')
  ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  min_people INTEGER NOT NULL,
  max_people INTEGER NOT NULL,
  price_per_person INTEGER NOT NULL,
  shuttle_price_per_person INTEGER NOT NULL DEFAULT 0,
  payment_due_days INTEGER NOT NULL DEFAULT 3,
  bank_code TEXT NOT NULL,
  bank_account TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id),
  UNIQUE(event_id, code)
);

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (
    status IN (
      'submitted',
      'payment_pending',
      'payment_submitted',
      'paid',
      'rejected',
      'cancelled'
    )
  ),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    review_status IN ('pending', 'approved', 'rejected')
  ),
  group_size INTEGER NOT NULL,
  arrival_mode TEXT NOT NULL,
  shuttle_required INTEGER NOT NULL DEFAULT 0,
  amount_due INTEGER,
  review_note TEXT,
  payment_due_at TEXT,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (plan_id) REFERENCES event_plans(id)
);

CREATE TABLE IF NOT EXISTS registration_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL,
  member_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
);

CREATE TABLE IF NOT EXISTS registration_profile_snapshots (
  registration_id INTEGER PRIMARY KEY,
  legal_name TEXT NOT NULL,
  gender TEXT NOT NULL,
  age_range TEXT NOT NULL,
  phone TEXT NOT NULL,
  occupation TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  national_id TEXT NOT NULL,
  emergency_name TEXT NOT NULL,
  emergency_relation TEXT NOT NULL,
  emergency_phone TEXT NOT NULL,
  ig_handle TEXT NOT NULL,
  line_id TEXT NOT NULL,
  nickname TEXT,
  city TEXT,
  diet_type TEXT NOT NULL,
  food_avoidances_json TEXT NOT NULL DEFAULT '[]',
  allergies_text TEXT,
  music_preferences_json TEXT NOT NULL DEFAULT '[]',
  hobbies_text TEXT,
  referral_source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
);

CREATE TABLE IF NOT EXISTS payment_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL,
  payer_name TEXT NOT NULL,
  bank_last5 TEXT NOT NULL,
  submitted_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (
    status IN ('submitted', 'confirmed', 'rejected')
  ),
  admin_note TEXT,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT,
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
);

CREATE INDEX IF NOT EXISTS idx_events_status
ON events(status);

CREATE INDEX IF NOT EXISTS idx_event_plans_event_id
ON event_plans(event_id);

CREATE INDEX IF NOT EXISTS idx_registrations_user_id
ON registrations(user_id);

CREATE INDEX IF NOT EXISTS idx_registrations_event_id
ON registrations(event_id);

CREATE INDEX IF NOT EXISTS idx_registrations_status
ON registrations(status);

CREATE INDEX IF NOT EXISTS idx_payment_submissions_registration_id
ON payment_submissions(registration_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_one_active_per_user_event
ON registrations(user_id, event_id)
WHERE status IN ('submitted', 'payment_pending', 'payment_submitted', 'paid');
