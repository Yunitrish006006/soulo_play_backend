CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  google_sub TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'player',
  bio TEXT,
  avatar_url TEXT,
  google_avatar_url TEXT,
  custom_avatar_url TEXT,
  avatar_source TEXT NOT NULL DEFAULT 'google' CHECK (
    avatar_source IN ('google', 'custom', 'upload')
  ),
  uploaded_avatar_version INTEGER NOT NULL DEFAULT 0,
  theme_mode TEXT NOT NULL DEFAULT 'system' CHECK (
    theme_mode IN ('light', 'dark', 'system')
  ),
  font_size_scale REAL NOT NULL DEFAULT 1.0,
  locale TEXT NOT NULL DEFAULT 'zh-Hant',
  last_active_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_users_email
ON users(email);
